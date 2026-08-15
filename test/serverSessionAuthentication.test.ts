import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { createResult } from "@adaptive-ds/result"
import { Hono } from "hono"
import * as v from "valibot"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { apiErrorResponseSchema } from "../src/api/errors/apiErrorResponseSchema.js"
import { appCreate } from "../src/app/appCreate.js"
import { identitySessionCreate } from "../src/identity/actions/identitySessionCreate.js"
import { identitySessionLoad } from "../src/identity/actions/identitySessionLoad.js"
import { identitySessionRevoke } from "../src/identity/actions/identitySessionRevoke.js"
import { identitySessionCookieSet } from "../src/identity/api/identitySessionCookieSet.js"
import { authSessionResponseSchema } from "../src/identity/api/authSessionResponseSchema.js"
import type { identitySessionTable } from "../src/identity/db/identitySessionTable.js"

const oidcConfiguration = {
  authMode: "oidc" as const,
  databaseUrl: "postgres://codeline.test/codeline",
  nodeEnv: "production" as const,
  oidcClientId: "client",
  oidcIssuer: "https://issuer.codeline.test",
  publicOrigin: "https://codeline.test",
}

const session = {
  createdAt: new Date("2026-08-14T12:00:00.000Z"),
  expiresAt: new Date("2026-08-15T00:00:00.000Z"),
  id: "session-1",
  lastUsedAt: null,
  revokedAt: null,
  tokenHash: "not-used-by-the-load-seam",
  userId: "oidc:user-1",
} satisfies typeof identitySessionTable.$inferSelect

test("session creation generates a 256-bit credential and an absolute twelve-hour expiry", async () => {
  let stored: Record<string, unknown> | undefined
  const database = {
    insert: () => ({
      values: (value: Record<string, unknown>) => {
        stored = value
        return { returning: async () => [{ ...session, ...value }] }
      },
    }),
  } as never
  const now = new Date("2026-08-14T12:00:00.000Z")

  const result = await identitySessionCreate(database, "user-1", { idCreate: () => "session-created", now })

  expect(result.success).toBe(true)
  if (!result.success) return
  expect(Buffer.from(result.data.token, "base64url")).toHaveLength(32)
  expect(result.data.session.expiresAt).toEqual(new Date("2026-08-15T00:00:00.000Z"))
  expect(stored?.token).toBeUndefined()
  expect(stored?.tokenHash).toBe(createHash("sha256").update(result.data.token).digest("hex"))
  expect("token" in result.data.session).toBe(false)
})

test("session credential creation has an injectable server-side seam rather than accepting request credentials", async () => {
  let storedTokenHash = ""
  const database = {
    insert: () => ({
      values: (value: { tokenHash: string }) => {
        storedTokenHash = value.tokenHash
        return { returning: async () => [session] }
      },
    }),
  } as never

  const result = await identitySessionCreate(database, "user-1", {
    credentialCreate: () => "server-generated-credential",
    idCreate: () => "session-created",
  })

  expect(result.success).toBe(true)
  if (!result.success) return
  expect(result.data.token).toBe("server-generated-credential")
  expect(storedTokenHash).toBe(createHash("sha256").update("server-generated-credential").digest("hex"))
})

test("session cookies use the required host-only security attributes", async () => {
  const app = new Hono<AppEnvironment>()
  app.get("/cookie", (context) => {
    identitySessionCookieSet(
      context,
      "credential",
      new Date("2026-08-15T00:00:00.000Z"),
      new Date("2026-08-14T12:00:00.000Z"),
    )
    return context.text("ok")
  })

  const response = await app.request("http://codeline.test/cookie")
  const cookie = response.headers.get("set-cookie") ?? ""

  expect(cookie).toContain("__Host-codeline-session=credential")
  expect(cookie).toContain("HttpOnly")
  expect(cookie).toContain("Secure")
  expect(cookie).toContain("SameSite=Lax")
  expect(cookie).toContain("Path=/")
  expect(cookie).not.toContain("Domain=")
})

test("OIDC authentication returns validated no-store 401 responses and leaves health public", async () => {
  const app = appCreate({ configuration: oidcConfiguration, database: {} as never })

  const unauthorized = await app.request("https://codeline.test/api/auth/session")
  const body = await unauthorized.json()
  const health = await app.request("https://codeline.test/api/health")

  expect(unauthorized.status).toBe(401)
  expect(unauthorized.headers.get("Cache-Control")).toBe("no-store")
  expect(v.safeParse(apiErrorResponseSchema, body).success).toBe(true)
  expect(health.status).toBe(200)
})

test("development authentication resolves the configured identity without a cookie", async () => {
  const app = appCreate({
    configuration: {
      authMode: "development",
      databaseUrl: "postgres://codeline.test/codeline",
      developmentIdentity: { displayName: "Development", identityKey: "development" },
      nodeEnv: "development",
      publicOrigin: "http://codeline.test",
    },
    database: { transaction: async (operation: (transaction: unknown) => Promise<unknown>) => operation({}) } as never,
    developmentIdentityUpsert: (async () =>
      createResult({ displayName: "Development", id: "development:development" } as never)) as never,
  })

  const response = await app.request("http://codeline.test/api/auth/session")

  expect(response.status).toBe(200)
  expect(v.safeParse(authSessionResponseSchema, await response.json()).success).toBe(true)
  expect(await (await app.request("http://codeline.test/api/auth/session")).json()).toEqual({
    authenticated: true,
    displayName: "Development",
    userId: "development:development",
  })
})

test("OIDC unsafe cookie requests require the exact configured Origin and logout is repeatable", async () => {
  let revokeCount = 0
  const load = (async () => createResult(session)) as typeof identitySessionLoad
  const revoke = (async () => {
    revokeCount += 1
    return createResult(session)
  }) as typeof identitySessionRevoke
  const app = appCreate({
    configuration: oidcConfiguration,
    database: {} as never,
    identitySessionLoad: load,
    identitySessionRevoke: revoke,
  })
  const headers = { Cookie: "__Host-codeline-session=credential" }

  const rejected = await app.request("https://codeline.test/api/auth/logout", {
    headers: { ...headers, Origin: "https://attacker.codeline.test" },
    method: "POST",
  })
  const first = await app.request("https://codeline.test/api/auth/logout", {
    headers: { ...headers, Origin: "https://codeline.test" },
    method: "POST",
  })
  const repeated = await app.request("https://codeline.test/api/auth/logout", {
    headers: { ...headers, Origin: "https://codeline.test" },
    method: "POST",
  })

  expect(rejected.status).toBe(403)
  expect(rejected.headers.get("Cache-Control")).toBe("no-store")
  expect(first.status).toBe(200)
  expect(repeated.status).toBe(200)
  expect(revokeCount).toBe(2)
  expect(first.headers.get("set-cookie")).toContain("Max-Age=0")
})

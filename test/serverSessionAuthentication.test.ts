import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { createResult } from "@adaptive-ds/result"
import { Hono } from "hono"
import * as v from "valibot"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { apiErrorResponseSchema } from "../src/api/errors/apiErrorResponseSchema.js"
import { appCreate } from "../src/app/appCreate.js"
import { runtimeConfigurationParse } from "../src/configuration/runtimeConfigurationParse.js"
import { identitySessionCreate } from "../src/identity/actions/identitySessionCreate.js"
import { identitySessionLoad } from "../src/identity/actions/identitySessionLoad.js"
import { identitySessionRevoke } from "../src/identity/actions/identitySessionRevoke.js"
import { authSessionResponseSchema } from "../src/identity/api/authSessionResponseSchema.js"
import { identitySessionCookieSet } from "../src/identity/api/identitySessionCookieSet.js"
import type { identitySessionTable } from "../src/identity/db/identitySessionTable.js"

const oidcConfiguration = {
  authMode: "oidc" as const,
  databaseUrl: "file:./data/db.sqlite",
  nodeEnv: "production" as const,
  oidcClientId: "client",
  oidcIssuer: "https://issuer.codeline.test",
  oidcOrganizationId: "contentoren",
  publicOrigin: "https://codeline.test",
}

const dualProviderConfiguration = {
  authMode: "oidc" as const,
  databaseUrl: "file:./data/db.sqlite",
  nodeEnv: "production" as const,
  oidcOrganizationId: "contentoren",
  oidcProviders: {
    authworks: {
      clientId: "authworks-client",
      issuer: "https://authworks.codeline.test",
      organizationId: "contentoren",
    },
    zitadel: {
      clientId: "zitadel-client",
      issuer: "https://zitadel.codeline.test",
      organizationId: "contentoren",
    },
  },
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

test("session creation generates a 256-bit credential and an absolute thirty-day expiry", async () => {
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
  expect(result.data.session.expiresAt).toEqual(new Date("2026-09-13T12:00:00.000Z"))
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
      new Date("2026-09-13T12:00:00.000Z"),
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
  expect(cookie).toContain("Max-Age=2592000")
  expect(cookie).toContain("Expires=Sun, 13 Sep 2026 12:00:00 GMT")
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
  const configuration = runtimeConfigurationParse({
    AUTH_MODE: "development",
    OIDC_ALLOWED_ORGANIZATION_ID: "development-organization",
    databaseUrl: "file:./data/db.sqlite",
    developmentIdentity: { displayName: "Development", identityKey: "development" },
    nodeEnv: "development",
    publicOrigin: "http://codeline.test",
  })
  expect(configuration.success).toBe(true)
  if (!configuration.success) return

  const app = appCreate({
    configuration: configuration.data,
    database: { transaction: async (operation: (transaction: unknown) => Promise<unknown>) => operation({}) } as never,
    identitySessionCreate: (async () =>
      createResult({
        session: { ...session, userId: "development:development" },
        token: "development-session",
      })) as typeof identitySessionCreate,
    developmentIdentityUpsert: (async () =>
      createResult({ displayName: "Development", id: "development:development" } as never)) as never,
    organizationMemberLoad: async () =>
      createResult({
        issuer: "urn:codeline:development",
        organizationId: "development-organization",
        subject: "development",
        userId: "development:development",
      } as never),
  })

  const response = await app.request("http://codeline.test/api/auth/session")

  expect(response.status).toBe(200)
  expect(v.safeParse(authSessionResponseSchema, await response.json()).success).toBe(true)
  expect(await (await app.request("http://codeline.test/api/auth/session")).json()).toEqual({
    authenticated: true,
    displayName: "Development",
    organizationId: "development-organization",
    token: "development-session",
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
    organizationMemberLoad: async () =>
      createResult({
        issuer: oidcConfiguration.oidcIssuer,
        organizationId: "contentoren",
        subject: "subject-1",
        userId: session.userId,
      } as never),
  })
  const headers = { Cookie: "__Host-codeline-session=credential", Host: "codeline.test" }

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

test("server authentication rechecks membership through either configured provider issuer", async () => {
  let activeIssuer: string | undefined = "https://authworks.codeline.test/"
  let membershipCheckCount = 0
  const app = appCreate({
    configuration: dualProviderConfiguration,
    database: {
      query: {
        applicationUserTable: { findFirst: async () => ({ displayName: "OIDC User" }) },
      },
    } as never,
    identitySessionLoad: (async () => createResult(session)) as typeof identitySessionLoad,
    organizationMemberLoad: async (_database, _userId, _organizationExternalId, issuer) => {
      membershipCheckCount += 1
      return createResult(
        activeIssuer === issuer
          ? ({
              issuer,
              organizationId: "contentoren",
              subject: "subject-1",
              userId: session.userId,
            } as never)
          : undefined,
      )
    },
  })
  const headers = { Cookie: "__Host-codeline-session=credential" }

  const authworks = await app.request("https://codeline.test/api/auth/session", { headers })
  activeIssuer = "https://zitadel.codeline.test/"
  const zitadel = await app.request("https://codeline.test/api/auth/session", { headers })
  activeIssuer = undefined
  const revoked = await app.request("https://codeline.test/api/auth/session", { headers })

  expect(authworks.status).toBe(200)
  expect(zitadel.status).toBe(200)
  expect(revoked.status).toBe(401)
  expect(await authworks.json()).toMatchObject({ organizationId: "contentoren", userId: session.userId })
  expect(await zitadel.json()).toMatchObject({ organizationId: "contentoren", userId: session.userId })
  expect(membershipCheckCount).toBe(5)
})

test("server authentication accepts a legacy raw membership for a trailing-slash issuer", async () => {
  const configuredIssuer = oidcConfiguration.oidcIssuer
  const app = appCreate({
    configuration: { ...oidcConfiguration, oidcIssuer: `${configuredIssuer}/` },
    database: {
      query: {
        applicationUserTable: { findFirst: async () => ({ displayName: "OIDC User" }) },
      },
    } as never,
    identitySessionLoad: (async () => createResult(session)) as typeof identitySessionLoad,
    organizationMemberLoad: async (_database, _userId, _organizationExternalId, issuer) => {
      expect(issuer).toBe(`${configuredIssuer}/`)
      return createResult({
        issuer: configuredIssuer,
        organizationId: "contentoren",
        subject: "subject-1",
        userId: session.userId,
      } as never)
    },
  })

  const response = await app.request("https://codeline.test/api/auth/session", {
    headers: { Cookie: "__Host-codeline-session=credential" },
  })

  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ organizationId: "contentoren", userId: session.userId })
})

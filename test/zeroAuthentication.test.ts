import { expect, test } from "bun:test"
import { createResult } from "@adaptive-ds/result"
import { identitySessionLoad } from "../src/identity/actions/identitySessionLoad.js"
import { identitySessionTable } from "../src/identity/db/identitySessionTable.js"
import { appCreate } from "../src/app/appCreate.js"

const configuration = {
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

function zeroAppCreate(load: typeof identitySessionLoad, tokenRead: (token: string) => void) {
  return appCreate({
    configuration,
    database: {} as never,
    identitySessionLoad: (async (database, token) => {
      tokenRead(token)
      return load(database, token)
    }) as typeof identitySessionLoad,
  })
}

test("Zero query transforms authenticate the forwarded opaque session cookie", async () => {
  let receivedToken = ""
  const app = zeroAppCreate(
    async () => createResult(session),
    (token) => (receivedToken = token),
  )
  const response = await app.request("https://codeline.test/api/query?userID=browser-spoof", {
    body: JSON.stringify(["transform", [{ args: [], id: "active-sessions", name: "activeSessions" }]]),
    headers: {
      Cookie: "__Host-codeline-session=opaque-session",
      "Content-Type": "application/json",
      Origin: "https://codeline.test",
    },
    method: "POST",
  })
  const body = await response.json()

  expect(response.status).toBe(200)
  expect(receivedToken).toBe("opaque-session")
  expect(body.userID).toBe("oidc:user-1")
  expect(JSON.stringify(body)).toContain("oidc:user-1")
  expect(JSON.stringify(body)).not.toContain("browser-spoof")
})

test("Zero mutations authenticate the forwarded opaque session cookie and return its authoritative user ID", async () => {
  let receivedToken = ""
  const app = zeroAppCreate(
    async () => createResult(session),
    (token) => (receivedToken = token),
  )
  const response = await app.request("https://codeline.test/api/mutate?schema=codeline&appID=codeline", {
    body: JSON.stringify({
      clientGroupID: "client-group",
      mutations: [],
      pushVersion: 1,
      requestID: "request",
      schemaVersion: 1,
      timestamp: Date.now(),
    }),
    headers: {
      Cookie: "__Host-codeline-session=opaque-session",
      "Content-Type": "application/json",
      Origin: "https://codeline.test",
    },
    method: "POST",
  })
  const body = await response.json()

  expect(response.status).toBe(200)
  expect(receivedToken).toBe("opaque-session")
  expect(body.userID).toBe("oidc:user-1")
})

test("Zero transforms reject missing or revoked forwarded session cookies", async () => {
  const app = zeroAppCreate(
    async () => createResult(undefined),
    () => undefined,
  )
  const response = await app.request("https://codeline.test/api/query", {
    body: JSON.stringify(["transform", []]),
    headers: { Cookie: "__Host-codeline-session=revoked-session", Origin: "https://codeline.test" },
    method: "POST",
  })

  expect(response.status).toBe(401)
  expect(response.headers.get("Cache-Control")).toBe("no-store")
})

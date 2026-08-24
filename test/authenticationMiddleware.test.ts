import { expect, test } from "bun:test"
import { createResult } from "@adaptive-ds/result"
import { Hono } from "hono"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import type { RuntimeConfiguration } from "../src/configuration/runtimeConfigurationSchema.js"
import { identitySessionLoad } from "../src/identity/actions/identitySessionLoad.js"
import { authenticationMiddleware } from "../src/identity/api/authenticationMiddleware.js"
import { identitySessionTable } from "../src/identity/db/identitySessionTable.js"

const configuredOrganizationExternalId = "configured-organization"
const configuredOrganizationId = "contentoren"
const configuredIssuer = "https://issuer.codeline.test"
const userId = "oidc:user-1"

const configuration = {
  authMode: "oidc",
  databaseUrl: "file:./data/db.sqlite",
  nodeEnv: "production",
  oidcClientId: "client",
  oidcIssuer: configuredIssuer,
  oidcOrganizationId: configuredOrganizationExternalId,
  publicOrigin: "https://codeline.test",
} as const satisfies RuntimeConfiguration

const session = {
  createdAt: new Date("2026-08-14T12:00:00.000Z"),
  expiresAt: new Date("2026-08-15T00:00:00.000Z"),
  id: "session-1",
  lastUsedAt: null,
  revokedAt: null,
  tokenHash: "not-used-by-the-load-seam",
  userId,
} satisfies typeof identitySessionTable.$inferSelect

test("authentication selects the configured membership when a user has multiple memberships", async () => {
  const app = authenticationApp([
    membership("other-organization", "https://other-issuer.codeline.test"),
    membership(configuredOrganizationId, configuredIssuer),
  ])

  const response = await app.request("https://codeline.test/protected", {
    headers: { Cookie: "__Host-codeline-session=opaque-session" },
  })

  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ organizationId: configuredOrganizationId, userId })
})

test("authentication rejects a stale membership from another issuer", async () => {
  const app = authenticationApp([membership(configuredOrganizationId, "https://stale-issuer.codeline.test")])

  const response = await app.request("https://codeline.test/protected", {
    headers: { Cookie: "__Host-codeline-session=opaque-session" },
  })

  expect(response.status).toBe(401)
})

test("authentication rejects a user without the configured organization membership", async () => {
  const app = authenticationApp([membership("other-organization", configuredIssuer)])

  const response = await app.request("https://codeline.test/protected", {
    headers: { Cookie: "__Host-codeline-session=opaque-session" },
  })

  expect(response.status).toBe(401)
})

test("authentication accepts the valid configured organization membership", async () => {
  const app = authenticationApp([membership(configuredOrganizationId, configuredIssuer)])

  const response = await app.request("https://codeline.test/protected", {
    headers: { Cookie: "__Host-codeline-session=opaque-session" },
  })

  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ organizationId: configuredOrganizationId, userId })
})

test("authentication rejects the event-feed reconnect after the injected session clock reaches expiry", async () => {
  let now = new Date("2026-08-14T12:00:00.000Z")
  const app = authenticationApp([membership(configuredOrganizationId, configuredIssuer)], {
    now: () => now,
    identitySessionLoad: async (_database, _token, sessionNow) =>
      (sessionNow ?? new Date()) < session.expiresAt ? createResult(session) : createResult(undefined),
  })
  const request = {
    headers: { Cookie: "__Host-codeline-session=opaque-session" },
  }

  const connected = await app.request("https://codeline.test/protected", request)
  expect(connected.status).toBe(200)

  now = session.expiresAt
  const reconnect = await app.request("https://codeline.test/protected", request)
  expect(reconnect.status).toBe(401)
  expect(reconnect.headers.get("Cache-Control")).toBe("no-store")
})

type AuthenticationAppOptions = {
  identitySessionLoad?: typeof identitySessionLoad
  now?: () => Date
}

function authenticationApp(
  memberships: readonly Membership[],
  options: AuthenticationAppOptions = {},
): Hono<AppEnvironment> {
  const database = {
    query: {
      organizationMemberTable: {
        findFirst: async ({ where }: { where: unknown }) => {
          const [organizationId, membershipUserId, issuer] = whereParameters(where)
          return memberships.find(
            (entry) =>
              entry.organizationId === organizationId && entry.userId === membershipUserId && entry.issuer === issuer,
          )
        },
      },
      organizationTable: {
        findFirst: async ({ where }: { where: unknown }) => {
          const [externalId] = whereParameters(where)
          return [
            { externalId: configuredOrganizationExternalId, id: configuredOrganizationId },
            { externalId: "other-organization", id: "other-organization" },
          ].find((entry) => entry.externalId === externalId)
        },
      },
    },
  }
  const app = new Hono<AppEnvironment>()
  app.use(
    "*",
    authenticationMiddleware(configuration, database as never, {
      identitySessionLoad:
        options.identitySessionLoad ?? ((async () => createResult(session)) as typeof identitySessionLoad),
      now: options.now,
    }),
  )
  app.get("/protected", (context) => context.json(context.var.requestIdentity))
  return app
}

function membership(organizationId: string, issuer: string): Membership {
  return { organizationId, issuer, subject: "subject-1", userId }
}

function whereParameters(where: unknown): readonly unknown[] {
  if (!isSqlWhere(where)) throw new Error("Expected a Drizzle SQL predicate.")
  return where.toQuery({
    casing: { getColumnCasing: (column: { name: string }) => column.name },
    escapeName: (name: string) => `"${name}"`,
    escapeParam: (index: number) => `$${index + 1}`,
    prepareTyping: () => undefined,
  }).params
}

function isSqlWhere(where: unknown): where is { toQuery: (configuration: unknown) => { params: readonly unknown[] } } {
  return typeof where === "object" && where !== null && "toQuery" in where && typeof where.toQuery === "function"
}

type Membership = {
  organizationId: string
  issuer: string
  subject: string
  userId: string
}

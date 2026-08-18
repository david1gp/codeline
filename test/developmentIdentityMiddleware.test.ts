import { expect, test } from "bun:test"
import { createResult, createResultError } from "@adaptive-ds/result"
import { Hono } from "hono"
import * as v from "valibot"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { apiErrorResponseSchema } from "../src/api/errors/apiErrorResponseSchema.js"
import { exampleDataFixture } from "../src/database/exampleDataFixture.js"
import { organizationMemberLoad } from "../src/identity/actions/organizationMemberLoad.js"
import { authenticationMiddleware } from "../src/identity/api/authenticationMiddleware.js"
import { developmentIdentityMiddleware } from "../src/identity/api/developmentIdentityMiddleware.js"

const developmentConfiguration = {
  authMode: "development",
  databaseUrl: "postgres://codeline.test/codeline",
  oidcOrganizationId: "configured-organization",
  developmentIdentity: { displayName: "Development User", identityKey: "development" },
  nodeEnv: "development",
} as const

test("development middleware rejects a missing organization membership", async () => {
  const app = new Hono<AppEnvironment>()
  app.use(
    "*",
    authenticationMiddleware(
      developmentConfiguration,
      { transaction: async (operation: (transaction: unknown) => Promise<unknown>) => operation({}) } as never,
      {
        developmentIdentityUpsert: async () => createResult({ id: "development:server-user" } as never),
        organizationMemberLoad: async () => createResult(undefined),
      },
    ),
  )
  app.get("/protected", (context) => context.json(context.var.requestIdentity))

  const response = await app.request("http://codeline.test/protected?userId=browser-spoof")

  expect(response.status).toBe(401)
})

test("development middleware rejects a stale issuer membership", async () => {
  const app = new Hono<AppEnvironment>()
  app.use(
    "*",
    authenticationMiddleware(
      {
        ...developmentConfiguration,
        developmentIdentity: { displayName: "Local Development", identityKey: "local-development" },
      },
      { transaction: async (operation: (transaction: unknown) => Promise<unknown>) => operation({}) } as never,
      {
        developmentIdentityUpsert: async () => createResult({ id: "development:local-development" } as never),
        organizationMemberLoad: async () =>
          createResult({
            issuer: "https://stale-issuer.codeline.test",
            organizationId: "contentoren",
            subject: "local-development",
            userId: "development:local-development",
          } as never),
      },
    ),
  )
  app.get("/protected", (context) => context.json(context.var.requestIdentity))

  const response = await app.request("http://codeline.test/protected")

  expect(response.status).toBe(401)
})

test("development middleware rejects an ambiguous membership result", async () => {
  const app = developmentAuthenticationApp(async () => createResult(undefined))

  const response = await app.request("http://codeline.test/protected")

  expect(response.status).toBe(401)
})

test("development middleware rejects membership repository failures", async () => {
  const app = developmentAuthenticationApp(async () =>
    createResultError("organizationMemberRepositoryLoad", "The organization membership could not be loaded."),
  )

  const response = await app.request("http://codeline.test/protected")

  expect(response.status).toBe(401)
})

test("development middleware accepts the seeded issuer-bound membership", async () => {
  const app = developmentAuthenticationApp(async (_database, userId, organizationExternalId, issuer) => {
    expect(userId).toBe(exampleDataFixture.user.id)
    expect(organizationExternalId).toBe(developmentConfiguration.oidcOrganizationId)
    expect(issuer).toBe(exampleDataFixture.organizationMembership.issuer)
    return createResult({
      issuer: exampleDataFixture.organizationMembership.issuer,
      organizationId: exampleDataFixture.organization.id,
      subject: exampleDataFixture.organizationMembership.subject,
      userId: exampleDataFixture.user.id,
    } as never)
  })

  const response = await app.request("http://codeline.test/protected")

  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    organizationId: exampleDataFixture.organization.id,
    userId: exampleDataFixture.user.id,
  })
})

function developmentAuthenticationApp(memberLoad: typeof organizationMemberLoad): Hono<AppEnvironment> {
  const app = new Hono<AppEnvironment>()
  app.use(
    "*",
    authenticationMiddleware(
      {
        ...developmentConfiguration,
        developmentIdentity: {
          displayName: exampleDataFixture.user.displayName,
          identityKey: exampleDataFixture.organizationMembership.subject,
        },
      },
      { transaction: async (operation: (transaction: unknown) => Promise<unknown>) => operation({}) } as never,
      {
        developmentIdentityUpsert: async () => createResult({ id: exampleDataFixture.user.id } as never),
        organizationMemberLoad: memberLoad,
      },
    ),
  )
  app.get("/protected", (context) => context.json(context.var.requestIdentity))
  return app
}

test("non-development protected requests fail with a validated unauthorized response", async () => {
  let upsertCalled = false
  const app = new Hono<AppEnvironment>()
  app.use(
    "*",
    developmentIdentityMiddleware(
      { ...developmentConfiguration, authMode: "oidc", nodeEnv: "production" },
      { transaction: async (operation: (transaction: unknown) => Promise<unknown>) => operation({}) } as never,
      async () => {
        upsertCalled = true
        return createResult({ id: "must-not-be-used" } as never)
      },
    ),
  )
  app.get("/protected", () => new Response("unexpected"))

  const response = await app.request("http://codeline.test/protected")
  const body = await response.json()

  expect(response.status).toBe(401)
  expect(v.safeParse(apiErrorResponseSchema, body).success).toBe(true)
  expect(upsertCalled).toBe(false)
})

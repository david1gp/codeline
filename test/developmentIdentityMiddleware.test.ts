import { expect, test } from "bun:test"
import { createResult } from "@adaptive-ds/result"
import { Hono } from "hono"
import * as v from "valibot"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { apiErrorResponseSchema } from "../src/api/errors/apiErrorResponseSchema.js"
import { developmentIdentityMiddleware } from "../src/identity/api/developmentIdentityMiddleware.js"

const developmentConfiguration = {
  databaseUrl: "postgres://codeline.test/codeline",
  developmentIdentity: { displayName: "Development User", identityKey: "development" },
  nodeEnv: "development",
} as const

test("development middleware sets only the server-derived durable request identity", async () => {
  const app = new Hono<AppEnvironment>()
  app.use(
    "*",
    developmentIdentityMiddleware(
      developmentConfiguration,
      { transaction: async (operation: (transaction: unknown) => Promise<unknown>) => operation({}) } as never,
      async () => createResult({ id: "development:server-user" } as never),
    ),
  )
  app.get("/protected", (context) => context.json(context.var.requestIdentity))

  const response = await app.request("http://codeline.test/protected?userId=browser-spoof")

  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ userId: "development:server-user" })
})

test("non-development protected requests fail with a validated unauthorized response", async () => {
  let upsertCalled = false
  const app = new Hono<AppEnvironment>()
  app.use(
    "*",
    developmentIdentityMiddleware(
      { ...developmentConfiguration, nodeEnv: "production" },
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

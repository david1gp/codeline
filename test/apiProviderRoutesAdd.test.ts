import { expect, test } from "bun:test"
import { Hono } from "hono"
import * as v from "valibot"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { apiErrorResponseSchema } from "../src/api/errors/apiErrorResponseSchema.js"
import { apiProviderRoutesAdd } from "../src/providers/api/apiProviderRoutesAdd.js"
import { providerApiConnectionTestResponseSchema } from "../src/providers/api/providerApiConnectionTestResponseSchema.js"
import { providerApiModelsResponseSchema } from "../src/providers/api/providerApiModelsResponseSchema.js"

const configuration = {
  apiKey: "$CLIPROXYAPI_API_KEY",
  baseUrl: "https://provider.test/v1",
  model: "gpt-test",
  provider: "cliproxyapi",
} as const

function authorizedApp() {
  const app = new Hono<AppEnvironment>()
  app.use("*", async (context, next) => {
    context.set("requestIdentity", { userId: "development:provider-api" })
    await next()
  })
  apiProviderRoutesAdd(app, {
    configuration,
    environment: { CLIPROXYAPI_API_KEY: "provider-secret" },
    fetch: async (_input, init) => {
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer provider-secret")
      return new Response(JSON.stringify({ data: [{ id: "gpt-test" }, { id: "other-model" }] }))
    },
  })
  return app
}

test("provider routes register independently and return strict discovery/testing contracts", async () => {
  const app = authorizedApp()

  const models = await app.request("http://codeline.test/providers/models", {
    body: "{}",
    headers: { "content-type": "application/json" },
    method: "POST",
  })
  expect(models.status).toBe(200)
  const modelsBody = await models.json()
  expect(v.safeParse(providerApiModelsResponseSchema, modelsBody).success).toBe(true)
  expect(modelsBody).toEqual({ models: [{ id: "gpt-test" }, { id: "other-model" }] })

  const connection = await app.request("http://codeline.test/providers/connection-test", {
    body: "{}",
    headers: { "content-type": "application/json" },
    method: "POST",
  })
  expect(connection.status).toBe(200)
  expect(v.safeParse(providerApiConnectionTestResponseSchema, await connection.json()).success).toBe(true)
})

test("provider routes require the existing authorized identity context", async () => {
  const app = new Hono<AppEnvironment>()
  apiProviderRoutesAdd(app, {
    configuration,
    environment: { CLIPROXYAPI_API_KEY: "provider-secret" },
    fetch: async () => new Response("{}"),
  })

  const response = await app.request("http://codeline.test/providers/models", {
    body: "{}",
    headers: { "content-type": "application/json" },
    method: "POST",
  })
  expect(response.status).toBe(401)
  expect(v.safeParse(apiErrorResponseSchema, await response.json()).success).toBe(true)
})

test("provider routes reject extra request fields and redact provider failures", async () => {
  const app = authorizedApp()

  const invalid = await app.request("http://codeline.test/providers/models", {
    body: JSON.stringify({ configuration }),
    headers: { "content-type": "application/json" },
    method: "POST",
  })
  expect(invalid.status).toBe(400)

  const secret = "provider-secret"
  const failedApp = new Hono<AppEnvironment>()
  failedApp.use("*", async (context, next) => {
    context.set("requestIdentity", { userId: "development:provider-api" })
    await next()
  })
  apiProviderRoutesAdd(failedApp, {
    configuration,
    environment: { CLIPROXYAPI_API_KEY: secret },
    fetch: async () => {
      throw new Error(`upstream leaked ${secret}`)
    },
  })

  const failed = await failedApp.request("http://codeline.test/providers/models", {
    body: "{}",
    headers: { "content-type": "application/json" },
    method: "POST",
  })
  expect(failed.status).toBe(500)
  const failedBody = await failed.text()
  expect(failedBody).not.toContain(secret)
  expect(failedBody).not.toContain("upstream leaked")
})

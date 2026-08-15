import { expect, test } from "bun:test"
import { Hono } from "hono"
import * as v from "valibot"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { apiErrorResponseSchema } from "../src/api/errors/apiErrorResponseSchema.js"
import { apiProviderRoutesAdd } from "../src/providers/api/apiProviderRoutesAdd.js"
import { providerApiCatalogResponseSchema } from "../src/providers/api/providerApiCatalogResponseSchema.js"
import { providerApiConnectionTestResponseSchema } from "../src/providers/api/providerApiConnectionTestResponseSchema.js"
import { providerApiModelsResponseSchema } from "../src/providers/api/providerApiModelsResponseSchema.js"
import { providerAgentCatalogLoad } from "../src/providers/catalog/providerAgentCatalogLoad.js"
import type { ProviderCatalog } from "../src/providers/schema/providerCatalogSchema.js"

const configuration = {
  apiKey: "$CLIPROXYAPI_API_KEY",
  baseUrl: "https://provider.test/v1",
  model: "gpt-test",
  provider: "cliproxyapi",
} as const

function authorizedApp(providerAgentCatalog?: ProviderCatalog) {
  const app = new Hono<AppEnvironment>()
  app.use("*", async (context, next) => {
    context.set("requestIdentity", { userId: "development:provider-api" })
    await next()
  })
  apiProviderRoutesAdd(app, {
    configuration,
    environment: { CLIPROXYAPI_API_KEY: "provider-secret" },
    providerAgentCatalog,
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

  const catalog = await app.request("http://codeline.test/providers/catalog")
  expect(catalog.status).toBe(401)
})

test("catalog route returns the real catalog in stable grouped order with redacted selectable metadata", async () => {
  const loaded = await providerAgentCatalogLoad(process.cwd())
  expect(loaded.success).toBe(true)
  if (!loaded.success) return

  const response = await authorizedApp(loaded.data).request("http://codeline.test/providers/catalog")
  expect(response.status).toBe(200)
  expect(response.headers.get("cache-control")).toBe("no-store")

  const body = v.parse(providerApiCatalogResponseSchema, await response.json())
  expect(body.providers.map((provider) => provider.id)).toEqual(["cliproxyapi", "codex-lb"])
  expect(body.providers[0]?.models.map((model) => model.id)).toEqual([
    "claude-fable-5",
    "claude-opus-4-6-thinking",
    "claude-opus-4-8",
    "claude-opus-5",
    "gemini-3.7-flash-high",
    "gpt-5.6-luna",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "grok-4.5",
    "grok-4.6",
  ])

  const codex = body.providers.find((provider) => provider.id === "codex-lb")
  const luna = codex?.models.find((model) => model.id === "gpt-5.6-luna")
  expect(luna).toMatchObject({
    capabilities: { input: ["image", "text"], output: ["text"], tools: false },
    cost: [
      { cache: { read: 0.02, write: 1.25 }, input: 0.2, output: 1.2 },
      { cache: { read: 0.2, write: 2.5 }, input: 2, output: 9, tier: { size: 200000, type: "context" } },
    ],
    family: "gpt-5.6",
    id: "gpt-5.6-luna",
    limit: { context: 272000, output: 128000 },
    name: "GPT 5.6 Luna (codex-lb)",
    selectable: true,
    status: "active",
    variants: [
      { effort: "high", id: "high" },
      { effort: "low", id: "low" },
      { effort: "max", id: "max" },
      { effort: "medium", id: "medium" },
      { effort: "xhigh", id: "xhigh" },
    ],
  })

  expect(
    body.providers.flatMap((provider) => provider.models).find((model) => model.id === "gpt-5.6-luna")?.selectable,
  ).toBe(false)
  const serialized = JSON.stringify(body)
  for (const forbidden of ["connection", "options", "agents", "prompt", "permission", "CODEX_LB_API_TOKEN"]) {
    expect(serialized).not.toContain(forbidden)
  }
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

import { afterAll, beforeAll, expect, test } from "bun:test"
import { createResult } from "@adaptive-ds/result"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { Hono } from "hono"
import { apiRoutesAdd } from "../src/api/apiRoutesAdd.js"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { appCreate } from "../src/app/appCreate.js"

let rootDir: string
const app = new Hono<AppEnvironment>()

beforeAll(async () => {
  rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "api-composition-test-"))
  await fs.writeFile(path.join(rootDir, "README.md"), "Codeline\n", "utf8")

  app.use("*", async (context, next) => {
    context.set("database", {} as never)
    context.set("requestIdentity", { userId: "development:composition" })
    await next()
  })
  apiRoutesAdd(app, async () => ({ success: true, data: undefined }), {
    projectRootDir: rootDir,
    streamReplayServiceCreate: () => ({
      append: async () => ({ success: true, data: {} as never }),
      replay: async () => ({ success: true, data: { checkpoint: {} as never, events: [], stale: false } }),
      start: async () => ({ success: true, data: {} as never }),
    }),
    runChildStreamResolve: async () => createResult(false),
  })
})

afterAll(async () => {
  await fs.rm(rootDir, { force: true, recursive: true })
})

test("shared API composition mounts project routes with the injected root", async () => {
  const response = await app.request("http://codeline.test/api/project/text?path=README.md")

  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ content: "Codeline\n", path: "README.md" })
})

test("shared API composition mounts stream routes with injected replay dependencies", async () => {
  const response = await app.request("http://codeline.test/api/sessions/session/streams/stream/events")

  expect(response.status).toBe(200)
  expect(response.headers.get("Content-Type")).toContain("text/event-stream")
  expect(await response.text()).toBe("")
})

test("shared API composition mounts provider routes with the development provider default", async () => {
  const response = await app.request("http://codeline.test/api/providers/models", {
    body: "{}",
    headers: { "content-type": "application/json" },
    method: "POST",
  })

  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ models: [{ id: "development-default" }] })
})

test("app composition forwards provider configuration and runtime dependencies", async () => {
  const user = {
    createdAt: new Date(),
    displayName: "Provider Composition User",
    email: null,
    id: "development:provider-composition",
    identityKey: "provider-composition",
    updatedAt: new Date(),
  }
  let authorization = ""
  const app = appCreate({
    configuration: {
      databaseUrl: "postgres://codeline.test/codeline",
      developmentIdentity: { displayName: user.displayName, identityKey: user.identityKey },
      nodeEnv: "development",
    },
    database: {
      transaction: async (operation: (transaction: unknown) => Promise<unknown>) =>
        operation({
          insert: () => ({
            values: () => ({
              onConflictDoNothing: () => ({ returning: async () => [user] }),
              onConflictDoUpdate: () => ({ returning: async () => [user] }),
            }),
          }),
        }),
    } as never,
    providerConfiguration: {
      apiKey: "$CLIPROXYAPI_API_KEY",
      baseUrl: "https://provider.test/v1",
      model: "composition-model",
      provider: "cliproxyapi",
    },
    providerEnvironment: { CLIPROXYAPI_API_KEY: "composition-secret" },
    providerFetch: async (_input, init) => {
      authorization = new Headers(init?.headers).get("authorization") ?? ""
      return new Response(JSON.stringify({ data: [{ id: "composition-model" }] }))
    },
  })

  const response = await app.request("http://codeline.test/api/providers/connection-test", {
    body: "{}",
    headers: { "content-type": "application/json" },
    method: "POST",
  })

  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({
    discoveredModelCount: 1,
    model: "composition-model",
    modelAvailable: true,
    ok: true,
    provider: "cliproxyapi",
  })
  expect(authorization).toBe("Bearer composition-secret")
})

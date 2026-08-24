import { afterAll, beforeAll, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { createResult } from "@adaptive-ds/result"
import { Hono } from "hono"
import { apiRoutesAdd } from "../src/api/apiRoutesAdd.js"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { appCreate } from "../src/app/appCreate.js"
import { metricsCollectorCreate } from "../src/metrics/metricsCollectorCreate.js"
import { providerAgentCatalogLoad } from "../src/providers/catalog/providerAgentCatalogLoad.js"
import { streamLiveSubscriptionCreate } from "../src/stream/actions/streamLiveSubscriptionCreate.js"
import { streamSseConnectionWriterCreate } from "../src/stream/actions/streamSseConnectionWriterCreate.js"
import { streamSseSchedulerCreate } from "../src/stream/actions/streamSseSchedulerCreate.js"

let rootDir: string
let projectId: string
const app = new Hono<AppEnvironment>()

beforeAll(async () => {
  rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "api-composition-test-"))
  const projectRoot = path.join(rootDir, "example-project")
  await fs.mkdir(projectRoot)
  await fs.writeFile(path.join(projectRoot, "README.md"), "Codeline\n", "utf8")
  const catalog = await providerAgentCatalogLoad(process.cwd())
  expect(catalog.success).toBe(true)
  if (!catalog.success) return

  app.use("*", async (context, next) => {
    context.set("database", {} as never)
    context.set("requestIdentity", { userId: "development:composition" })
    await next()
  })
  apiRoutesAdd(app, async () => ({ success: true, data: undefined }), {
    projectRootDirs: [rootDir],
    providerAgentCatalog: catalog.data,
  })
})

afterAll(async () => {
  await fs.rm(rootDir, { force: true, recursive: true })
})

test("shared API composition mounts scoped project routes", async () => {
  const list = await app.request("http://codeline.test/api/project/list")
  projectId = (await list.json()).projects[0].id
  const response = await app.request(`http://codeline.test/api/project/text?project=${projectId}&path=README.md`)

  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ content: "Codeline\n", path: "README.md" })
})

test("fails fast when authenticated event route dependencies are incomplete", () => {
  const partialApp = new Hono<AppEnvironment>()

  expect(() =>
    apiRoutesAdd(partialApp, async () => ({ success: true, data: undefined }), {
      configuration: {} as never,
      database: {} as never,
      journalCursorCodec: {} as never,
    }),
  ).toThrow("The authenticated event feed dependencies are required.")
})

test("app composition wires the complete authenticated event route", async () => {
  const user = {
    displayName: "Events Composition User",
    id: "development:events-composition",
    identityKey: "events-composition",
  }
  const app = appCreate({
    configuration: {
      authMode: "development",
      databaseUrl: "file:./data/db.sqlite",
      developmentIdentity: { displayName: user.displayName, identityKey: user.identityKey },
      nodeEnv: "development",
      oidcOrganizationId: "events-composition-organization",
    },
    database: {
      transaction: async (operation: (transaction: unknown) => Promise<unknown>) => operation({}),
    } as never,
    developmentIdentityUpsert: async () => createResult(user as never),
    journalBacklogRead: async () => {
      const pages = async function* () {
        yield createResult([])
      }
      return createResult({
        afterSequence: 0,
        mode: "replay" as const,
        pages: pages(),
        replayUpperBound: 0,
        selectedCursor: undefined,
      } as never)
    },
    journalCursorCodec: {} as never,
    metricsCollector: metricsCollectorCreate(),
    organizationMemberLoad: async () =>
      createResult({
        issuer: "urn:codeline:development",
        organizationId: "events-composition-organization",
        subject: user.identityKey,
        userId: user.id,
      } as never),
    streamLiveSubscription: streamLiveSubscriptionCreate(),
    streamSseConnectionWriterCreate: streamSseConnectionWriterCreate,
    streamSseNow: Date.now,
    streamSseScheduler: streamSseSchedulerCreate(),
  })

  const controller = new AbortController()
  const response = await app.request("http://codeline.test/api/events", { signal: controller.signal })

  expect(response.status).toBe(200)
  expect(response.headers.get("content-type")).toContain("text/event-stream")
  controller.abort()
  await response.body?.cancel()
})

test("does not mount migrated session routes without authenticated Drizzle journal dependencies", async () => {
  const response = await app.request("http://codeline.test/api/sessions")

  expect(response.status).toBe(404)
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

test("shared API composition forwards the loaded provider catalog route", async () => {
  const response = await app.request("http://codeline.test/api/providers/catalog")

  expect(response.status).toBe(200)
  expect((await response.json()).providers.map((provider: { id: string }) => provider.id)).toEqual([
    "cliproxyapi",
    "codex-lb",
  ])
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
      authMode: "development",
      databaseUrl: "file:./data/db.sqlite",
      developmentIdentity: { displayName: user.displayName, identityKey: user.identityKey },
      nodeEnv: "development",
      oidcOrganizationId: "provider-composition-organization",
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
    organizationMemberLoad: async () =>
      createResult({
        issuer: "urn:codeline:development",
        organizationId: "provider-composition-organization",
        subject: user.identityKey,
        userId: user.id,
      } as never),
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

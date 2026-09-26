import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { Hono } from "hono"
import type { AppEnvironment } from "../../../src/api/appEnvironment.js"
import { apiGlobalAgentPresetRoutesAdd } from "../../../src/configuration/api/apiGlobalAgentPresetRoutesAdd.js"
import { configurationStoreCreate } from "../../../src/configuration/configurationStoreCreate.js"
import { globalAgentPresetDocumentDefaults } from "../../../src/configuration/globalAgentPresetDocumentDefaults.js"

const directories: string[] = []

function tempDirectory(): string {
  const directory = mkdtempSync(join(Bun.env.TMPDIR ?? "/tmp", "codeline-global-presets-api-"))
  directories.push(directory)
  return directory
}

afterEach(() => {
  while (directories.length > 0) {
    const directory = directories.pop()
    if (directory !== undefined) rmSync(directory, { force: true, recursive: true })
  }
})

test("authenticated global preset API reads defaults, validates and persists complete documents", async () => {
  const store = await configurationStoreCreate({
    authorEmail: "api-test@example.com",
    authorName: "API Test",
    branch: "main",
    dir: tempDirectory(),
  })
  expect(store.success).toBe(true)
  if (!store.success) return

  const app = new Hono<AppEnvironment>()
  app.use("*", async (context, next) => {
    context.set("requestIdentity", { userId: "test-user" })
    await next()
  })
  apiGlobalAgentPresetRoutesAdd(app, { configurationStore: store.data })

  const initial = await app.request("http://codeline.test/global/agent-presets")
  expect(initial.status).toBe(200)
  expect(await initial.json()).toEqual(globalAgentPresetDocumentDefaults())

  const invalid = await app.request("http://codeline.test/global/agent-presets", {
    body: JSON.stringify({ ...globalAgentPresetDocumentDefaults(), unexpected: true }),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  })
  expect(invalid.status).toBe(400)

  const document = globalAgentPresetDocumentDefaults()
  document.presets.push({
    id: "work",
    name: "Work",
    skillSetIds: ["default-skills"],
    commandSetIds: [],
    toolSetIds: [],
    subagentSetIds: [],
    subagentNames: [],
    executionAgentId: "agent-base",
    modelId: "model-base",
  })
  const written = await app.request("http://codeline.test/global/agent-presets", {
    body: JSON.stringify(document),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  })
  expect(written.status).toBe(200)
  expect(await written.json()).toEqual(document)

  const loaded = await app.request("http://codeline.test/global/agent-presets")
  expect(loaded.status).toBe(200)
  expect(await loaded.json()).toEqual(document)
})

test("global preset API rejects unauthenticated access and reports unavailable persistence", async () => {
  const unauthenticated = new Hono<AppEnvironment>()
  apiGlobalAgentPresetRoutesAdd(unauthenticated)
  expect((await unauthenticated.request("http://codeline.test/global/agent-presets")).status).toBe(401)

  const authenticated = new Hono<AppEnvironment>()
  authenticated.use("*", async (context, next) => {
    context.set("requestIdentity", { userId: "test-user" })
    await next()
  })
  apiGlobalAgentPresetRoutesAdd(authenticated)
  expect((await authenticated.request("http://codeline.test/global/agent-presets")).status).toBe(500)
})

import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { e2eCheckpointStoreCreate } from "../../e2e/e2eCheckpointStoreCreate.js"
import { e2eExampleDataSeedForMember, e2eExampleDataSeedRestore } from "../../e2e/e2eExampleDataSeedForMember.js"
import { exampleDataFixture } from "../../src/database/exampleDataFixture.js"

const origin = "https://preview.codeline.work"
const runId = "e2esample123"
const savedEnvironment = { ...process.env }
const originalFetch = globalThis.fetch
let directory: string
let requests: Array<{ url: string; init: RequestInit }>
let sampleResponse: unknown

const mapping = Object.fromEntries(Object.entries({
  server: exampleDataFixture.servers.map((item) => item.id),
  agent: exampleDataFixture.agents.map((item) => item.id),
  project: exampleDataFixture.projects.map((item) => item.id),
  folder: exampleDataFixture.projects.map((item) => item.folderKey),
  path: exampleDataFixture.projects.map((item) => item.path),
  session: exampleDataFixture.sessions.map((item) => item.id),
  sessionRequest: exampleDataFixture.sessions.map((item) => item.clientRequestId),
  message: exampleDataFixture.sessions.flatMap((item) => item.messages.map((message) => message.id)),
  messageRequest: exampleDataFixture.sessions.flatMap((item) => item.messages.map((message) => message.clientRequestId)),
  run: exampleDataFixture.runs.map((item) => item.id),
  runClient: exampleDataFixture.runs.map((item) => item.clientRunId),
  stream: [...new Set([...exampleDataFixture.runs, ...exampleDataFixture.attempts].map((item) => item.streamId))],
  attempt: exampleDataFixture.attempts.map((item) => item.id),
  delegation: exampleDataFixture.delegations.map((item) => item.id),
  tool: [...exampleDataFixture.tools.map((item) => item.toolCallId), ...exampleDataFixture.delegations.map((item) => item.delegationKey)],
}).flatMap(([kind, ids]) => ids.map((source) => [`${kind}:${source}`, `e2e-${runId}-${source}`])))

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "e2e-sample-helper-"))
  Object.assign(process.env, {
    NODE_ENV: "test",
    E2E_FIXTURE_CHECKPOINT_DIRECTORY: directory,
    E2E_RUN_ID: "e2eparent123",
    E2E_TARGET: "production",
    E2E_FIXTURE_API_TOKEN: "x".repeat(40),
    PUBLIC_ORIGIN: origin,
  })
  await e2eCheckpointStoreCreate(directory).save({
    version: 1,
    target: "production",
    origin,
    runId: "e2eparent123",
    createdAt: new Date().toISOString(),
    completedSuites: [],
    resourceIds: { fixtureRunIds: [runId] },
  })
  globalThis.fetch = Object.assign(
    async (url: URL | RequestInfo, init?: RequestInit) => {
      requests.push({ url: String(url), init: init ?? {} })
      return Response.json(sampleResponse)
    },
    { preconnect: originalFetch.preconnect },
  ) as typeof fetch
})

afterAll(async () => {
  globalThis.fetch = originalFetch
  for (const key of new Set([...Object.keys(process.env), ...Object.keys(savedEnvironment)])) {
    if (savedEnvironment[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnvironment[key]
  }
  if (directory) await rm(directory, { recursive: true, force: true })
})

test("runner mode clones registered sample data through its authenticated API and never restores shared seed", async () => {
  requests = []
  sampleResponse = { exists: true, userId: "owner1", mapping }
  const result = await e2eExampleDataSeedForMember({ subject: "subject1", userId: "owner1", runId })
  expect(result["session:example-session-active-1"]).toBe(mapping["session:example-session-active-1"])
  expect(result["agent:example-agent-simulation-streaming"]).toBe(mapping["agent:example-agent-simulation-streaming"])
  expect(requests).toHaveLength(1)
  expect(requests[0]?.url).toBe(`${origin}/api/_e2e/fixtures/runs/${runId}/sample-sessions`)
  expect(requests[0]?.init).toMatchObject({ method: "POST", redirect: "error", cache: "no-store" })
  expect(requests[0]?.init.headers).toEqual({ Authorization: `Bearer ${"x".repeat(40)}` })
  await e2eExampleDataSeedRestore()
  expect(requests).toHaveLength(1)
})

test("runner mode rejects unregistered runs and mismatched or incomplete clone manifests", async () => {
  requests = []
  await expect(e2eExampleDataSeedForMember({ subject: "subject1", userId: "owner1", runId: "e2eother123" }))
    .rejects.toThrow("Unregistered")
  expect(requests).toHaveLength(0)
  sampleResponse = { exists: true, userId: "other", mapping }
  await expect(e2eExampleDataSeedForMember({ subject: "subject1", userId: "owner1", runId }))
    .rejects.toThrow("owner mismatch")
  sampleResponse = { exists: true, userId: "owner1", mapping: { "session:example-session-active-1": "clone" } }
  await expect(e2eExampleDataSeedForMember({ subject: "subject1", userId: "owner1", runId }))
    .rejects.toThrow("manifest is incomplete")
})

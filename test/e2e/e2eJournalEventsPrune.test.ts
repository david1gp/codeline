import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { e2eCheckpointStoreCreate } from "../../e2e/e2eCheckpointStoreCreate.js"
import { e2eJournalEventsPrune } from "../../e2e/e2eJournalEventsPrune.js"

const origin = "https://preview.codeline.work"
const runId = "journalhelperone"
const savedEnvironment = { ...process.env }
const originalFetch = globalThis.fetch
let directory: string
let requests: Array<{ url: string; init: RequestInit }>

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "e2e-journal-helper-"))
  Object.assign(process.env, {
    NODE_ENV: "test",
    E2E_FIXTURE_CHECKPOINT_DIRECTORY: directory,
    E2E_RUN_ID: "e2eparent123",
    E2E_TARGET: "production",
    E2E_FIXTURE_API_TOKEN: "x".repeat(40),
    PUBLIC_ORIGIN: origin,
  })
  await e2eCheckpointStoreCreate(directory).save({
    version: 2,
    target: "production",
    origin,
    runId: "e2eparent123",
    createdAt: new Date().toISOString(),
    suiteManifest: [],
    completedSuites: [],
    resourceIds: { fixtureRunIds: [runId] },
  })
  requests = []
  globalThis.fetch = Object.assign(
    async (url: URL | RequestInfo, init?: RequestInit) => {
      requests.push({ url: String(url), init: init ?? {} })
      return Response.json({
        exists: true,
        pruned: [{ userId: "user1", prunedEventCount: 2, prunedThroughSequence: 4 }],
      })
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

test("runner journal prune calls the authenticated owned API without a local database script", async () => {
  expect(await e2eJournalEventsPrune(runId)).toEqual([
    { userId: "user1", prunedEventCount: 2, prunedThroughSequence: 4 },
  ])
  expect(requests).toEqual([
    {
      url: `${origin}/api/_e2e/fixtures/runs/${runId}/prune-journal`,
      init: {
        method: "POST",
        headers: { Authorization: `Bearer ${"x".repeat(40)}` },
        body: undefined,
        redirect: "error",
        cache: "no-store",
      },
    },
  ])
})

test("runner journal prune rejects unregistered runs and incomplete context before any request", async () => {
  requests = []
  await expect(e2eJournalEventsPrune("unregistered")).rejects.toThrow("Unregistered E2E fixture run")
  delete process.env.E2E_TARGET
  try {
    await expect(e2eJournalEventsPrune(runId)).rejects.toThrow("E2E_RUN_ID, E2E_TARGET")
    expect(requests).toHaveLength(0)
  } finally {
    process.env.E2E_TARGET = "production"
  }
})

test("explicit legacy-local mode still dispatches to the guarded local script", async () => {
  requests = []
  const saved = {
    E2E_RUN_ID: process.env.E2E_RUN_ID,
    E2E_TARGET: process.env.E2E_TARGET,
    E2E_FIXTURE_API_TOKEN: process.env.E2E_FIXTURE_API_TOKEN,
    E2E_LEGACY_LOCAL: process.env.E2E_LEGACY_LOCAL,
  }
  delete process.env.E2E_RUN_ID
  delete process.env.E2E_TARGET
  delete process.env.E2E_FIXTURE_API_TOKEN
  process.env.E2E_LEGACY_LOCAL = "1"
  try {
    // The script validates the argument before opening SQLite; this must fail locally.
    await expect(e2eJournalEventsPrune("invalid_run_id")).rejects.toThrow()
    expect(requests).toHaveLength(0)
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

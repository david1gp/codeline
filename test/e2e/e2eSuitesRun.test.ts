import { expect, test } from "bun:test"
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { e2eCheckpointStoreCreate } from "../../e2e/e2eCheckpointStoreCreate.js"
import type { E2eCheckpoint } from "../../e2e/e2eCheckpointSchema.js"
import { e2eSuitesRun } from "../../e2e/e2eSuitesRun.js"

const origin = "https://preview.codeline.work"
const checkpoint = (overrides: Partial<E2eCheckpoint> = {}): E2eCheckpoint => ({
  version: 1,
  target: "production",
  origin,
  runId: "runone123",
  createdAt: "2026-09-25T12:00:00.000Z",
  completedSuites: [],
  resourceIds: { fixtureRunIds: ["runone123"] },
  ...overrides,
})

test("a failed suite keeps its atomic checkpoint and resume skips only completed suites", async () => {
  const directory = await mkdtemp(join(tmpdir(), "e2e-runner-"))
  try {
    const store = e2eCheckpointStoreCreate(directory)
    const runs: string[] = []
    const cleaned: string[] = []
    const options = {
      target: "production" as const,
      origin,
      suites: ["e2e/first.spec.ts", "e2e/second.spec.ts"],
      store,
      now: () => new Date("2026-09-25T13:00:00.000Z"),
      runIdCreate: () => "runone123",
      cleanup: async (state: E2eCheckpoint) => {
        cleaned.push(state.runId)
      },
    }
    await expect(
      e2eSuitesRun({
        ...options,
        suiteRun: async (suite) => {
          runs.push(suite)
          if (suite === "e2e/second.spec.ts") throw new Error("suite failed")
        },
      }),
    ).rejects.toThrow("suite failed")
    expect((await store.load("production"))?.completedSuites).toEqual(["e2e/first.spec.ts"])
    expect(cleaned).toEqual([])
    await e2eSuitesRun({
      ...options,
      suiteRun: async (suite) => {
        runs.push(suite)
        const state = await store.load("production")
        if (state) await store.save({ ...state, resourceIds: { fixtureRunIds: [state.runId] } })
      },
    })
    expect(runs).toEqual(["e2e/first.spec.ts", "e2e/second.spec.ts", "e2e/second.spec.ts"])
    expect(cleaned).toEqual(["runone123"])
    expect(await store.load("production")).toBeUndefined()
    expect((await readdir(directory)).filter((entry) => entry.endsWith(".tmp"))).toEqual([])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("stale runs are cleaned before a fresh run and target mismatch never resumes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "e2e-runner-"))
  try {
    const store = e2eCheckpointStoreCreate(directory)
    await store.save(checkpoint({ createdAt: "2026-09-23T12:00:00.000Z" }))
    await store.save(checkpoint({ target: "dev", runId: "devrun123", origin: "https://dev.example.test" }))
    const events: string[] = []
    await e2eSuitesRun({
      target: "production",
      origin,
      suites: ["e2e/first.spec.ts"],
      store,
      now: () => new Date("2026-09-25T13:00:00.000Z"),
      runIdCreate: () => "freshrun123",
      cleanup: async (state) => {
        events.push(`clean:${state.runId}`)
      },
      suiteRun: async (_suite, state) => {
        events.push(`suite:${state.runId}`)
      },
    })
    expect(events).toEqual(["clean:runone123", "suite:freshrun123", "clean:freshrun123"])
    expect((await store.load("dev"))?.runId).toBe("devrun123")
    await expect(
      e2eSuitesRun({
        target: "dev",
        origin,
        suites: ["e2e/first.spec.ts"],
        store,
        now: () => new Date("2026-09-25T13:00:00.000Z"),
        cleanup: async () => {},
        suiteRun: async () => {
          throw new Error("must not run")
        },
      }),
    ).rejects.toThrow("origin mismatch")
    expect((await store.load("dev"))?.runId).toBe("devrun123")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("cleanup failure retains checkpoint, invalid data is rejected, and a lock prevents concurrent runners", async () => {
  const directory = await mkdtemp(join(tmpdir(), "e2e-runner-"))
  try {
    const store = e2eCheckpointStoreCreate(directory)
    await store.save(checkpoint())
    await expect(
      e2eSuitesRun({
        target: "production",
        origin,
        suites: ["e2e/first.spec.ts"],
        store,
        now: () => new Date("2026-09-25T13:00:00.000Z"),
        cleanup: async () => {
          throw new Error("not verified")
        },
        suiteRun: async () => {},
      }),
    ).rejects.toThrow("not verified")
    expect((await store.load("production"))?.completedSuites).toEqual(["e2e/first.spec.ts"])
    const unlock = await store.lock()
    await expect(store.lock()).rejects.toThrow()
    await unlock()
    await writeFile(join(directory, "production.json"), JSON.stringify({ ...checkpoint(), target: "dev" }))
    await expect(store.load("production")).rejects.toThrow("Invalid E2E checkpoint")
    await expect(store.save({ ...checkpoint(), runId: "bad/id" })).rejects.toThrow()
    expect(JSON.parse(await readFile(join(directory, "production.json"), "utf8")).target).toBe("dev")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("an expired run is not replaced if its cleanup fails", async () => {
  const directory = await mkdtemp(join(tmpdir(), "e2e-runner-"))
  try {
    const store = e2eCheckpointStoreCreate(directory)
    await store.save(checkpoint({ createdAt: "2026-09-23T12:00:00.000Z" }))
    let runs = 0
    await expect(
      e2eSuitesRun({
        target: "production",
        origin,
        suites: ["e2e/first.spec.ts"],
        store,
        now: () => new Date("2026-09-25T13:00:00.000Z"),
        cleanup: async () => {
          throw new Error("unsafe to purge")
        },
        suiteRun: async () => {
          runs++
        },
      }),
    ).rejects.toThrow("unsafe to purge")
    expect(runs).toBe(0)
    expect((await store.load("production"))?.runId).toBe("runone123")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("suite registration is reloaded after each child and preserved when the next child fails", async () => {
  const directory = await mkdtemp(join(tmpdir(), "e2e-runner-"))
  try {
    const store = e2eCheckpointStoreCreate(directory)
    const options = {
      target: "production" as const, origin, store,
      suites: ["e2e/first.spec.ts", "e2e/second.spec.ts"],
      now: () => new Date("2026-09-25T13:00:00.000Z"),
      runIdCreate: () => "e2erun123",
    }
    await expect(e2eSuitesRun({
      ...options,
      cleanup: async () => { throw new Error("must not clean failed current data") },
      suiteRun: async (suite) => {
        const state = (await store.load("production"))!
        await store.save({ ...state, resourceIds: { fixtureRunIds: [...state.resourceIds.fixtureRunIds, suite === "e2e/first.spec.ts" ? "e2efirst123" : "e2esecond123"] } })
        if (suite === "e2e/second.spec.ts") throw new Error("child failed")
      },
    })).rejects.toThrow("child failed")
    expect(await store.load("production")).toMatchObject({
      completedSuites: ["e2e/first.spec.ts"],
      resourceIds: { fixtureRunIds: ["e2efirst123", "e2esecond123"] },
    })
    const cleaned: string[][] = []
    await e2eSuitesRun({
      ...options,
      cleanup: async (state) => { cleaned.push(state.resourceIds.fixtureRunIds) },
      suiteRun: async (suite) => { expect(suite).toBe("e2e/second.spec.ts") },
    })
    expect(cleaned).toEqual([["e2efirst123", "e2esecond123"]])
    expect(await store.load("production")).toBeUndefined()
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("a no-data run clears its checkpoint only after successful cleanup", async () => {
  const directory = await mkdtemp(join(tmpdir(), "e2e-runner-"))
  try {
    const store = e2eCheckpointStoreCreate(directory)
    let cleaned = false
    await e2eSuitesRun({
      target: "production", origin, store, suites: ["e2e/first.spec.ts"],
      runIdCreate: () => "e2enodata123",
      suiteRun: async () => {},
      cleanup: async (state) => {
        expect(state.resourceIds.fixtureRunIds).toEqual([])
        cleaned = true
      },
    })
    expect(cleaned).toBe(true)
    expect(await store.load("production")).toBeUndefined()
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("corrupt checkpoints stay untouched and a crashed runner lock can be reclaimed", async () => {
  const directory = await mkdtemp(join(tmpdir(), "e2e-runner-"))
  try {
    const store = e2eCheckpointStoreCreate(directory)
    const path = join(directory, "production.json")
    await writeFile(path, "{broken")
    await writeFile(join(directory, ".runner.lock"), "999999999\n")
    let ran = false
    await expect(e2eSuitesRun({
      target: "production", origin, store, suites: ["e2e/first.spec.ts"],
      suiteRun: async () => { ran = true }, cleanup: async () => {},
    })).rejects.toThrow("Invalid E2E checkpoint")
    expect(ran).toBe(false)
    expect(await readFile(path, "utf8")).toBe("{broken")
    expect((await readdir(directory)).includes(".runner.lock")).toBe(false)
    await writeFile(join(directory, ".runner.lock"), "unknown")
    await expect(store.lock()).rejects.toThrow("unknown owner")
    expect(await readFile(join(directory, ".runner.lock"), "utf8")).toBe("unknown")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("each invocation scans server expiry without local checkpoints, including after a suite fails", async () => {
  const directory = await mkdtemp(join(tmpdir(), "e2e-runner-"))
  try {
    const store = e2eCheckpointStoreCreate(directory)
    let scans = 0
    await expect(e2eSuitesRun({
      target: "production", origin, store, suites: ["e2e/first.spec.ts"],
      runIdCreate: () => "e2eempty123",
      cleanup: async () => { throw new Error("failed run must be retained") },
      cleanupExpiredServerRuns: async (target, serverOrigin) => {
        expect(target).toBe("production")
        expect(serverOrigin).toBe(origin)
        scans++
      },
      suiteRun: async () => { throw new Error("suite failed") },
    })).rejects.toThrow("suite failed")
    expect(scans).toBe(2)
    expect((await store.load("production"))?.runId).toBe("e2eempty123")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

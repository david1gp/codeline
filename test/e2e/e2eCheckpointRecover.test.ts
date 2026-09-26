import { expect, test } from "bun:test"
import type { E2eCheckpoint } from "../../e2e/e2eCheckpointSchema.js"
import { e2eCheckpointRecover } from "../../e2e/e2eCheckpointRecover.js"

const checkpoint: E2eCheckpoint = {
  version: 2,
  target: "production",
  origin: "https://preview.codeline.work",
  runId: "e2epartial123",
  createdAt: "2026-09-26T15:43:10.557Z",
  suiteManifest: [{ id: "e2e/single", steps: ["e2e/single/single.spec.ts"] }],
  completedSuites: [],
  resourceIds: { fixtureRunIds: ["e2efixture123"] },
}

test("recovery cleans only the requested checkpoint and clears it after verified cleanup", async () => {
  let stored: E2eCheckpoint | undefined = checkpoint
  const calls: string[] = []
  const ids = await e2eCheckpointRecover({
    runId: checkpoint.runId,
    target: checkpoint.target,
    origin: checkpoint.origin,
    store: {
      lock: async () => {
        calls.push("lock")
        return async () => {
          calls.push("release")
        }
      },
      load: async () => stored,
      clear: async () => {
        calls.push("clear")
        stored = undefined
      },
    },
    cleanup: async (value) => {
      expect(value).toEqual(checkpoint)
      calls.push("cleanup")
    },
  })
  expect(ids).toMatchObject({ success: true, data: ["e2efixture123"] })
  expect(calls).toEqual(["lock", "cleanup", "clear", "release"])
})

test("recovery retains a mismatched checkpoint without attempting cleanup", async () => {
  let touched = false
  const result = await e2eCheckpointRecover({
    runId: "e2eother123",
    target: "production",
    origin: checkpoint.origin,
    store: {
      lock: async () => async () => {},
      load: async () => checkpoint,
      clear: async () => {
        touched = true
      },
    },
    cleanup: async () => {
      touched = true
    },
  })
  expect(result).toMatchObject({ success: false, errorMessage: "Checkpoint run or target mismatch; refusing recovery" })
  expect(touched).toBe(false)
})

test("recovery retains the checkpoint if cleanup fails or its contents change", async () => {
  for (const change of [false, true]) {
    let stored = checkpoint
    let cleared = false
    const result = await e2eCheckpointRecover({
      runId: checkpoint.runId,
      target: checkpoint.target,
      origin: checkpoint.origin,
      store: {
        lock: async () => async () => {},
        load: async () => stored,
        clear: async () => {
          cleared = true
        },
      },
      cleanup: async () => {
        if (!change) throw new Error("Verification failed")
        stored = {
          ...checkpoint,
          resourceIds: { fixtureRunIds: [...checkpoint.resourceIds.fixtureRunIds, "e2enewfixture"] },
        }
      },
    })
    expect(result).toMatchObject({
      success: false,
      errorMessage: change
        ? "Checkpoint changed during recovery; refusing to clear it"
        : "E2E checkpoint cleanup or verification failed; checkpoint retained: Verification failed",
    })
    expect(cleared).toBe(false)
  }
})

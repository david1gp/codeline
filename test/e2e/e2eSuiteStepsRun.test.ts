import { expect, test } from "bun:test"
import type { E2eCheckpoint } from "../../e2e/e2eCheckpointSchema.js"
import { e2eSuiteStepsRun } from "../../e2e/e2eSuiteStepsRun.js"

const checkpoint: E2eCheckpoint = {
  version: 2,
  target: "dev",
  origin: "https://preview.codeline.work",
  runId: "e2erun123",
  createdAt: "2026-09-25T12:00:00.000Z",
  completedSuites: [],
  suiteManifest: [{ id: "e2e/chat", steps: ["e2e/chat/one.spec.ts", "e2e/chat/two.spec.ts"] }],
  resourceIds: { fixtureRunIds: [] },
}

test("workflow steps run sequentially with one worker and checkpoint-bound target identity", async () => {
  const calls: string[][] = []
  let active = 0
  let peak = 0
  await e2eSuiteStepsRun(checkpoint.suiteManifest[0]!, checkpoint, async (args, env) => {
    active++
    peak = Math.max(peak, active)
    calls.push(args)
    expect(env.E2E_RUN_ID).toBe("e2erun123")
    expect(env.E2E_TARGET).toBe("dev")
    expect(env.PUBLIC_ORIGIN).toBe(checkpoint.origin)
    await Promise.resolve()
    active--
  })
  expect(peak).toBe(1)
  expect(calls).toEqual([
    ["playwright", "test", "e2e/chat/one.spec.ts", "--workers=1"],
    ["playwright", "test", "e2e/chat/two.spec.ts", "--workers=1"],
  ])
})

test("a failed workflow step prevents subsequent steps", async () => {
  const steps: string[] = []
  await expect(
    e2eSuiteStepsRun(
      { id: "e2e/chat", steps: ["e2e/chat/one.spec.ts", "e2e/chat/two.spec.ts"] },
      checkpoint,
      async (args) => {
        steps.push(args[2]!)
        throw new Error("step failed")
      },
    ),
  ).rejects.toThrow("step failed")
  expect(steps).toEqual(["e2e/chat/one.spec.ts"])
})

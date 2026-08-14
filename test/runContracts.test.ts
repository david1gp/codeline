import { expect, test } from "bun:test"
import * as v from "valibot"
import { runBudgetSchema } from "../src/run/schema/runBudgetSchema.js"
import { runExecutionSnapshotSchema } from "../src/run/schema/runExecutionSnapshotSchema.js"
import { runFailureClassSchema } from "../src/run/schema/runFailureClassSchema.js"
import { runRetryAdmissionSchema } from "../src/run/schema/runRetryAdmissionSchema.js"
import { runStatusSchema } from "../src/run/schema/runStatusSchema.js"

const snapshot = {
  configuration: {
    apiKey: "$CODEX_LB_API_TOKEN",
    baseUrl: "https://provider.example.test",
    model: "coding-model",
    provider: "codex-lb" as const,
  },
  configurationRevision: "configuration-revision-1",
  target: { agentId: "agent-1", serverId: "server-1" },
}

test("run contracts default and bound the initial budget", () => {
  expect(v.safeParse(runBudgetSchema, {}).output).toEqual({
    maxAttempts: 1,
    maxChildRuns: 0,
    maxDurationMs: 300_000,
  })
  expect(v.safeParse(runBudgetSchema, { maxAttempts: 2 }).success).toBe(true)
  expect(v.safeParse(runBudgetSchema, { maxAttempts: 5 }).success).toBe(true)
  expect(v.safeParse(runBudgetSchema, { maxAttempts: 6 }).success).toBe(false)
  expect(v.safeParse(runBudgetSchema, { maxChildRuns: 1 }).success).toBe(false)
  expect(v.safeParse(runBudgetSchema, { maxDurationMs: 86_400_001 }).success).toBe(false)
})

test("execution snapshots are strict and retain only secret references", () => {
  expect(v.safeParse(runExecutionSnapshotSchema, snapshot).success).toBe(true)
  expect(
    v.safeParse(runExecutionSnapshotSchema, {
      ...snapshot,
      configuration: { ...snapshot.configuration, apiKey: "literal-secret" },
    }).success,
  ).toBe(false)
  expect(v.safeParse(runExecutionSnapshotSchema, { ...snapshot, extra: true }).success).toBe(false)
  expect(v.safeParse(runExecutionSnapshotSchema, { ...snapshot, configurationRevision: "" }).success).toBe(false)
})

test("run statuses are closed to the durable lifecycle vocabulary", () => {
  expect(v.safeParse(runStatusSchema, "accepted").success).toBe(true)
  expect(v.safeParse(runStatusSchema, "cancelled").success).toBe(false)
})

test("retry contracts are closed and retain next-attempt admission fields", () => {
  expect(v.safeParse(runFailureClassSchema, "retryable").success).toBe(true)
  expect(v.safeParse(runFailureClassSchema, "unknown").success).toBe(false)
  expect(
    v.safeParse(runRetryAdmissionSchema, {
      attemptOrdinal: 1,
      decision: "retry",
      failureClass: "retryable",
      maxAttempts: 3,
      nextAttemptOrdinal: 2,
      reason: "retryable_failure",
      remainingAttempts: 2,
    }).success,
  ).toBe(true)
})

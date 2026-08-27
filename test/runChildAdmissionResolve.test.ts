import { expect, test } from "bun:test"
import * as v from "valibot"
import { runChildAdmissionResolve } from "../src/run/actions/runChildAdmissionResolve.js"
import { runChildAdmissionInputSchema } from "../src/run/schema/runChildAdmissionInputSchema.js"
import { runChildAdmissionReasonSchema } from "../src/run/schema/runChildAdmissionReasonSchema.js"
import { runChildAdmissionSchema } from "../src/run/schema/runChildAdmissionSchema.js"

const input = {
  attemptStatus: "running" as const,
  budget: { maxChildDepth: 2, maxChildRuns: 3 },
  cancelled: false,
  deadlineAt: 2_000,
  depth: 0,
  descendantCount: 0,
  now: 1_000,
  parentStatus: "running" as const,
}

test("child admission contracts are closed", () => {
  expect(v.safeParse(runChildAdmissionInputSchema, input).success).toBe(true)
  expect(v.safeParse(runChildAdmissionInputSchema, { ...input, extra: true }).success).toBe(false)
  expect(v.safeParse(runChildAdmissionSchema, { decision: "admit", reason: "admitted" }).success).toBe(true)
  expect(v.safeParse(runChildAdmissionSchema, { decision: "reject", reason: "unknown" }).success).toBe(false)
  expect(v.safeParse(runChildAdmissionReasonSchema, "unknown").success).toBe(false)
})

test("child admission admits within the aggregate count and depth boundaries", () => {
  expect(runChildAdmissionResolve(input)).toEqual({
    success: true,
    data: { decision: "admit", reason: "admitted" },
  })
})

test("child admission is disabled by the default budget", () => {
  expect(runChildAdmissionResolve({ ...input, budget: {} })).toEqual({
    success: true,
    data: { decision: "reject", reason: "child_run_limit_exhausted" },
  })
})

test("child admission keeps the one-child budget closed for distinct requests", () => {
  expect(runChildAdmissionResolve({ ...input, budget: { maxChildRuns: 1 }, descendantCount: 1 })).toEqual({
    success: true,
    data: { decision: "reject", reason: "child_run_limit_exhausted" },
  })
})

test.each([
  ["parent_not_running", { parentStatus: "accepted" }],
  ["parent_not_running", { parentStatus: "aborted" }],
  ["parent_not_running", { parentStatus: "failed" }],
  ["parent_not_running", { parentStatus: "succeeded" }],
  ["current_attempt_not_running", { attemptStatus: "accepted" }],
  ["cancelled", { cancelled: true }],
  ["deadline_exceeded", { now: 2_000 }],
  ["child_run_limit_exhausted", { descendantCount: 3 }],
  ["child_depth_limit_exhausted", { depth: 2 }],
] as const)("child admission rejects with %s", (reason, override) => {
  expect(runChildAdmissionResolve({ ...input, ...override })).toEqual({
    success: true,
    data: { decision: "reject", reason },
  })
})

test("child admission checks status before cancellation and limits", () => {
  expect(
    runChildAdmissionResolve({
      ...input,
      attemptStatus: "failed",
      cancelled: true,
      descendantCount: 3,
      depth: 2,
      now: 2_000,
      parentStatus: "succeeded",
    }),
  ).toEqual({
    success: true,
    data: { decision: "reject", reason: "parent_not_running" },
  })
})

test("child admission rejects malformed policy input", () => {
  expect(runChildAdmissionResolve({ ...input, depth: -1 })).toMatchObject({
    success: false,
    op: "runChildAdmissionResolve",
  })
})

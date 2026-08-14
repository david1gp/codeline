import { expect, test } from "bun:test"
import { runRetryAdmissionResolve } from "../src/run/actions/runRetryAdmissionResolve.js"

const input = {
  attemptOrdinal: 1,
  attemptStatus: "failed" as const,
  budget: { maxAttempts: 3 },
  failure: { code: "provider_timeout", message: "The provider timed out." },
}

test("retry admission classifies a retryable failure and admits the next attempt", () => {
  expect(runRetryAdmissionResolve(input)).toEqual({
    success: true,
    data: {
      attemptOrdinal: 1,
      decision: "retry",
      failureClass: "retryable",
      maxAttempts: 3,
      nextAttemptOrdinal: 2,
      reason: "retryable_failure",
      remainingAttempts: 2,
    },
  })
})

test("retry admission treats unknown failures as terminal", () => {
  expect(
    runRetryAdmissionResolve({
      ...input,
      failure: { code: "assistant_empty", message: "No assistant text was returned." },
    }),
  ).toEqual({
    success: true,
    data: {
      attemptOrdinal: 1,
      decision: "terminal",
      failureClass: "terminal",
      maxAttempts: 3,
      nextAttemptOrdinal: null,
      reason: "terminal_failure",
      remainingAttempts: 2,
    },
  })
})

test("retry admission stops at the attempt budget", () => {
  expect(
    runRetryAdmissionResolve({
      ...input,
      attemptOrdinal: 3,
    }),
  ).toEqual({
    success: true,
    data: {
      attemptOrdinal: 3,
      decision: "terminal",
      failureClass: "retryable",
      maxAttempts: 3,
      nextAttemptOrdinal: null,
      reason: "attempt_budget_exhausted",
      remainingAttempts: 0,
    },
  })
})

test("retry admission does not reopen a non-failed attempt", () => {
  expect(
    runRetryAdmissionResolve({
      ...input,
      attemptStatus: "aborted",
    }),
  ).toMatchObject({
    success: true,
    data: { decision: "terminal", reason: "attempt_not_failed", nextAttemptOrdinal: null },
  })
})

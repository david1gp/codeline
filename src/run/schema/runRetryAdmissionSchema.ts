import * as v from "valibot"
import { runFailureClassSchema } from "./runFailureClassSchema.js"

const attemptOrdinalSchema = v.pipe(v.number(), v.integer(), v.minValue(1))
const nonNegativeIntegerSchema = v.pipe(v.number(), v.integer(), v.minValue(0))

export const runRetryAdmissionSchema = v.strictObject({
  attemptOrdinal: attemptOrdinalSchema,
  decision: v.picklist(["retry", "terminal"]),
  failureClass: runFailureClassSchema,
  maxAttempts: attemptOrdinalSchema,
  nextAttemptOrdinal: v.nullable(attemptOrdinalSchema),
  reason: v.picklist([
    "attempt_budget_exhausted",
    "attempt_not_failed",
    "execution_provenance_unknown",
    "terminal_failure",
    "retryable_failure",
    "tool_execution_observed",
  ]),
  remainingAttempts: nonNegativeIntegerSchema,
})

export type RunRetryAdmission = v.InferOutput<typeof runRetryAdmissionSchema>

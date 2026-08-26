import { createResult, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { runErrorCodes } from "../errors/runErrorCodes.js"
import { runResultCreateError } from "../errors/runResultCreateError.js"
import { runRetryAdmissionInputSchema } from "../schema/runRetryAdmissionInputSchema.js"
import { type RunRetryAdmission, runRetryAdmissionSchema } from "../schema/runRetryAdmissionSchema.js"
import { runFailureClassResolve } from "./runFailureClassResolve.js"

export function runRetryAdmissionResolve(input: unknown): Result<RunRetryAdmission> {
  const op = "runRetryAdmissionResolve"
  const parsedInput = v.safeParse(runRetryAdmissionInputSchema, input)
  if (!parsedInput.success)
    return runResultCreateError(op, "The run retry admission input is invalid.", runErrorCodes.invalidInput)

  const { attemptOrdinal, attemptStatus, budget, failure } = parsedInput.output
  const failureClass = runFailureClassResolve(failure)
  const remainingAttempts = Math.max(0, budget.maxAttempts - attemptOrdinal)
  const terminal = (reason: RunRetryAdmission["reason"]): Result<RunRetryAdmission> =>
    createResult({
      attemptOrdinal,
      decision: "terminal",
      failureClass,
      maxAttempts: budget.maxAttempts,
      nextAttemptOrdinal: null,
      reason,
      remainingAttempts,
    })

  if (attemptStatus !== "failed") return terminal("attempt_not_failed")
  if (failureClass === "terminal") return terminal("terminal_failure")
  if (remainingAttempts === 0) return terminal("attempt_budget_exhausted")

  const admission = {
    attemptOrdinal,
    decision: "retry" as const,
    failureClass,
    maxAttempts: budget.maxAttempts,
    nextAttemptOrdinal: attemptOrdinal + 1,
    reason: "retryable_failure" as const,
    remainingAttempts,
  }
  const parsedAdmission = v.safeParse(runRetryAdmissionSchema, admission)
  if (!parsedAdmission.success)
    return runResultCreateError(op, "The run retry admission is invalid.", runErrorCodes.retryAdmissionInvalid)
  return createResult(parsedAdmission.output)
}

import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { runChildAdmissionInputSchema } from "../schema/runChildAdmissionInputSchema.js"
import { type RunChildAdmission, runChildAdmissionSchema } from "../schema/runChildAdmissionSchema.js"

export function runChildAdmissionResolve(input: unknown): Result<RunChildAdmission> {
  const op = "runChildAdmissionResolve"
  const parsedInput = v.safeParse(runChildAdmissionInputSchema, input)
  if (!parsedInput.success) return createResultError(op, "The run child admission input is invalid.")

  const { attemptStatus, budget, cancelled, deadlineAt, depth, descendantCount, now, parentStatus } = parsedInput.output
  const reject = (reason: RunChildAdmission["reason"]): Result<RunChildAdmission> =>
    createResult({ decision: "reject", reason })

  if (parentStatus !== "running") return reject("parent_not_running")
  if (attemptStatus !== "running") return reject("current_attempt_not_running")
  if (cancelled) return reject("cancelled")
  if (now >= deadlineAt) return reject("deadline_exceeded")
  if (descendantCount >= budget.maxChildRuns) return reject("child_run_limit_exhausted")
  if (depth >= budget.maxChildDepth) return reject("child_depth_limit_exhausted")

  const admission = { decision: "admit" as const, reason: "admitted" as const }
  const parsedAdmission = v.safeParse(runChildAdmissionSchema, admission)
  if (!parsedAdmission.success) return createResultError(op, "The run child admission result is invalid.")
  return createResult(parsedAdmission.output)
}

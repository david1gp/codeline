import * as v from "valibot"

export const runChildAdmissionReasonSchema = v.picklist([
  "admitted",
  "cancelled",
  "child_depth_limit_exhausted",
  "child_run_limit_exhausted",
  "current_attempt_not_running",
  "deadline_exceeded",
  "parent_not_running",
])

export type RunChildAdmissionReason = v.InferOutput<typeof runChildAdmissionReasonSchema>

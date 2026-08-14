import * as v from "valibot"

export const attemptStatusSchema = v.picklist(["accepted", "running", "succeeded", "failed", "aborted"])

export type AttemptStatus = v.InferOutput<typeof attemptStatusSchema>

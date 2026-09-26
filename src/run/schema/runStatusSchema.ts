import * as v from "valibot"

export const runStatusSchema = v.picklist(["accepted", "running", "succeeded", "failed", "aborted"])

export type RunStatus = v.InferOutput<typeof runStatusSchema>

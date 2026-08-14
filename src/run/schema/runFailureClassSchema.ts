import * as v from "valibot"

export const runFailureClassSchema = v.picklist(["retryable", "terminal"])

export type RunFailureClass = v.InferOutput<typeof runFailureClassSchema>

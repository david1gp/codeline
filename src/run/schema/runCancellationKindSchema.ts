import * as v from "valibot"

export const runCancellationKindSchema = v.picklist(["requested", "ancestor"])

export type RunCancellationKind = v.InferOutput<typeof runCancellationKindSchema>

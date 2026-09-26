import * as v from "valibot"

export const runRetryExecutionEvidenceSchema = v.picklist(["none", "tool_result", "unknown"])

export type RunRetryExecutionEvidence = v.InferOutput<typeof runRetryExecutionEvidenceSchema>

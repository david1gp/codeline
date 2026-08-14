import * as v from "valibot"
import { runFailureMetadataSchema } from "./runFailureMetadataSchema.js"

const runDelegationResultTextSchema = v.pipe(v.string(), v.maxLength(16_384))

export const runDelegationResultSchema = v.variant("status", [
  v.strictObject({
    status: v.literal("succeeded"),
    text: runDelegationResultTextSchema,
  }),
  v.strictObject({
    failure: runFailureMetadataSchema,
    status: v.literal("failed"),
    text: runDelegationResultTextSchema,
  }),
  v.strictObject({
    failure: runFailureMetadataSchema,
    status: v.literal("aborted"),
    text: runDelegationResultTextSchema,
  }),
])

export type RunDelegationResult = v.InferOutput<typeof runDelegationResultSchema>

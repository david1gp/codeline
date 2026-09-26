import * as v from "valibot"
import { runFailureMetadataSchema } from "./runFailureMetadataSchema.js"
import { runStatusSchema } from "./runStatusSchema.js"

export const runTransitionInputSchema = v.strictObject({
  failure: v.optional(runFailureMetadataSchema),
  status: runStatusSchema,
})

export type RunTransitionInput = v.InferOutput<typeof runTransitionInputSchema>

import * as v from "valibot"
import { apiSequenceSchema } from "../../api/schema/apiSequenceSchema.js"
import { runFailureMetadataSchema } from "../schema/runFailureMetadataSchema.js"

export const runActiveDetailSchema = v.strictObject({
  failure: v.nullable(runFailureMetadataSchema),
  lastSequence: apiSequenceSchema,
  partialText: v.pipe(v.string(), v.maxLength(16_384)),
})

export type RunActiveDetail = v.InferOutput<typeof runActiveDetailSchema>

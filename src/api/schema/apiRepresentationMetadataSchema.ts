import * as v from "valibot"
import { apiEtagSchema } from "./apiEtagSchema.js"
import { apiRevisionSchema } from "./apiRevisionSchema.js"
import { apiSequenceSchema } from "./apiSequenceSchema.js"

export const apiRepresentationMetadataSchema = v.strictObject({
  asOfSequence: apiSequenceSchema,
  etag: apiEtagSchema,
  revision: apiRevisionSchema,
  schemaVersion: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(64)),
})

export type ApiRepresentationMetadata = v.InferOutput<typeof apiRepresentationMetadataSchema>

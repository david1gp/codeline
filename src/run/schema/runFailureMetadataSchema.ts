import * as v from "valibot"

const failureCodeSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100))
const failureMessageSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(2_000))

export const runFailureMetadataSchema = v.strictObject({
  code: failureCodeSchema,
  message: failureMessageSchema,
})

export type RunFailureMetadata = v.InferOutput<typeof runFailureMetadataSchema>

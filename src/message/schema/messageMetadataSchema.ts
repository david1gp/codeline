import * as v from "valibot"

export const messageMetadataSchema = v.record(v.string(), v.unknown())

export type MessageMetadata = v.InferOutput<typeof messageMetadataSchema>

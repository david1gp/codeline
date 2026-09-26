import * as v from "valibot"

export const sessionMetadataSchema = v.record(v.string(), v.unknown())

export type SessionMetadata = v.InferOutput<typeof sessionMetadataSchema>

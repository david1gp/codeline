import * as v from "valibot"
import { apiRepresentationMetadataSchema } from "../../api/schema/apiRepresentationMetadataSchema.js"
import { sessionSnapshotPayloadSchema } from "./sessionSnapshotPayloadSchema.js"

export const sessionSnapshotResponseSchema = v.strictObject({
  ...apiRepresentationMetadataSchema.entries,
  ...sessionSnapshotPayloadSchema.entries,
})

export type SessionSnapshotResponse = v.InferOutput<typeof sessionSnapshotResponseSchema>

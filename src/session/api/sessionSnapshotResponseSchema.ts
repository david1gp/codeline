import * as v from "valibot"
import { apiRepresentationMetadataSchema } from "../../api/schema/apiRepresentationMetadataSchema.js"
import { sessionSnapshotPayloadSchema } from "./sessionSnapshotPayloadSchema.js"
import { sessionSettledSnapshotResponseSchema } from "./sessionSettledSnapshotResponseSchema.js"

const legacySessionSnapshotResponseSchema = v.strictObject({
  ...apiRepresentationMetadataSchema.entries,
  ...sessionSnapshotPayloadSchema.entries,
})

export const sessionSnapshotResponseSchema = v.union([
  legacySessionSnapshotResponseSchema,
  sessionSettledSnapshotResponseSchema,
])

export type SessionSnapshotResponse = v.InferOutput<typeof sessionSnapshotResponseSchema>

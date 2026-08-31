import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import { sessionSnapshotWatermarkSchema } from "./sessionSnapshotWatermarkSchema.js"

export const sessionOlderPageCursorPayloadSchema = v.strictObject({
  boundary: v.strictObject({
    id: apiPublicIdSchema,
    sequence: v.pipe(v.number(), v.integer(), v.minValue(1)),
  }),
  kind: v.literal("session-older"),
  messageThroughSeq: sessionSnapshotWatermarkSchema,
  sessionId: apiPublicIdSchema,
  throughSeq: sessionSnapshotWatermarkSchema,
  userId: apiPublicIdSchema,
  version: v.literal(1),
})

export type SessionOlderPageCursorPayload = v.InferOutput<typeof sessionOlderPageCursorPayloadSchema>

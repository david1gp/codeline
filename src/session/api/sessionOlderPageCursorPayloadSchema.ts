import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import { sessionSnapshotWatermarkSchema } from "./sessionSnapshotWatermarkSchema.js"

export const sessionOlderPageCursorPayloadSchema = v.pipe(
  v.strictObject({
    beforePosition: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(Number.MAX_SAFE_INTEGER)),
    kind: v.literal("session-older"),
    sessionId: apiPublicIdSchema,
    throughPosition: sessionSnapshotWatermarkSchema,
    userId: apiPublicIdSchema,
    version: v.literal(1),
  }),
  v.check(
    (cursor) => cursor.beforePosition <= cursor.throughPosition,
    "The older-page cursor boundary exceeds its watermark.",
  ),
)

export type SessionOlderPageCursorPayload = v.InferOutput<typeof sessionOlderPageCursorPayloadSchema>

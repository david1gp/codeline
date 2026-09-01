import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import { sessionOlderPageCursorSchema } from "../api/sessionOlderPageCursorSchema.js"
import { sessionSemanticStepSchema } from "../api/sessionSemanticStepSchema.js"
import { sessionSnapshotWatermarkSchema } from "../api/sessionSnapshotWatermarkSchema.js"

const sessionCacheHistoryEntryPositionSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(1),
  v.maxValue(Number.MAX_SAFE_INTEGER),
)
const sessionCacheHistoryEntrySizeSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(1),
  v.maxValue(Number.MAX_SAFE_INTEGER),
)

export const sessionCacheHistoryEntryRecordSchema = v.pipe(
  v.strictObject({
    byteSize: sessionCacheHistoryEntrySizeSchema,
    entryId: apiPublicIdSchema,
    pageCursor: v.nullable(sessionOlderPageCursorSchema),
    payload: sessionSemanticStepSchema,
    position: sessionCacheHistoryEntryPositionSchema,
    schemaVersion: v.literal("session-cache.v1"),
    sessionId: apiPublicIdSchema,
    storedAt: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(Number.MAX_SAFE_INTEGER)),
    throughPosition: sessionSnapshotWatermarkSchema,
    userId: apiPublicIdSchema,
  }),
  v.check((record) => record.entryId === record.payload.id, "History entry identity is inconsistent."),
  v.check((record) => record.position === record.payload.sequence, "History entry position is inconsistent."),
  v.check((record) => record.position <= record.throughPosition, "History entry is newer than its snapshot watermark."),
)

export type SessionCacheHistoryEntryRecord = v.InferOutput<typeof sessionCacheHistoryEntryRecordSchema>

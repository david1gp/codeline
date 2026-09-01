import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import { sessionOlderPageCursorSchema } from "../api/sessionOlderPageCursorSchema.js"
import { sessionSnapshotWatermarkSchema } from "../api/sessionSnapshotWatermarkSchema.js"

export const sessionCacheHistoryPageRecordSchema = v.pipe(
  v.strictObject({
    byteSize: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(Number.MAX_SAFE_INTEGER)),
    entryIds: v.pipe(v.array(apiPublicIdSchema), v.maxLength(25)),
    hasMore: v.boolean(),
    nextCursor: v.nullable(sessionOlderPageCursorSchema),
    requestCursor: sessionOlderPageCursorSchema,
    schemaVersion: v.literal("session-cache.v1"),
    sessionId: apiPublicIdSchema,
    storedAt: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(Number.MAX_SAFE_INTEGER)),
    throughPosition: sessionSnapshotWatermarkSchema,
    userId: apiPublicIdSchema,
  }),
  v.check(
    (record) => new Set(record.entryIds).size === record.entryIds.length,
    "History page entry IDs are not unique.",
  ),
  v.check(
    (record) => record.hasMore === (record.nextCursor !== null),
    "History page pagination state is inconsistent.",
  ),
)

export type SessionCacheHistoryPageRecord = v.InferOutput<typeof sessionCacheHistoryPageRecordSchema>

import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import { journalCursorSchema } from "../../journal/schema/journalCursorSchema.js"
import { sessionBoundedShellSchema } from "../api/sessionBoundedShellSchema.js"
import { sessionCompactRunInputStateSchema } from "../api/sessionCompactRunInputStateSchema.js"
import { sessionLatestAnswerSchema } from "../api/sessionLatestAnswerSchema.js"
import { sessionOlderPageCursorSchema } from "../api/sessionOlderPageCursorSchema.js"
import { sessionSnapshotWatermarkSchema } from "../api/sessionSnapshotWatermarkSchema.js"

const sessionCacheStoredAtSchema = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(Number.MAX_SAFE_INTEGER))
const sessionCacheByteSizeSchema = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(Number.MAX_SAFE_INTEGER))

export const sessionCacheSnapshotRecordSchema = v.pipe(
  v.strictObject({
    byteSize: sessionCacheByteSizeSchema,
    entryIds: v.pipe(v.array(apiPublicIdSchema), v.maxLength(25)),
    payload: v.strictObject({
      detailCursor: journalCursorSchema,
      hasMore: v.boolean(),
      latestAnswer: sessionLatestAnswerSchema,
      olderCursor: v.nullable(sessionOlderPageCursorSchema),
      session: sessionBoundedShellSchema,
      state: sessionCompactRunInputStateSchema,
      throughPosition: sessionSnapshotWatermarkSchema,
    }),
    schemaVersion: v.literal("session-cache.v1"),
    sessionId: apiPublicIdSchema,
    storedAt: sessionCacheStoredAtSchema,
    userId: apiPublicIdSchema,
  }),
  v.check((record) => record.payload.session.id === record.sessionId, "Snapshot session identity is inconsistent."),
  v.check((record) => new Set(record.entryIds).size === record.entryIds.length, "Snapshot entry IDs are not unique."),
  v.check(
    (record) => record.payload.hasMore === (record.payload.olderCursor !== null),
    "Snapshot pagination state is inconsistent.",
  ),
)

export type SessionCacheSnapshotRecord = v.InferOutput<typeof sessionCacheSnapshotRecordSchema>

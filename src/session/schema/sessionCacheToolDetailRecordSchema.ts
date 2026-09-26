import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import { runToolDetailResponseSchema } from "../../run/api/runToolDetailResponseSchema.js"

export const sessionCacheToolDetailRecordSchema = v.pipe(
  v.strictObject({
    byteSize: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(Number.MAX_SAFE_INTEGER)),
    detailId: apiPublicIdSchema,
    payload: runToolDetailResponseSchema,
    runId: apiPublicIdSchema,
    schemaVersion: v.literal("session-cache.v1"),
    sessionId: apiPublicIdSchema,
    storedAt: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(Number.MAX_SAFE_INTEGER)),
    userId: apiPublicIdSchema,
  }),
  v.check((record) => record.payload.kind === "finalized", "Only finalized tool detail may be cached."),
  v.check(
    (record) => record.payload.kind !== "finalized" || record.payload.detail.runId === record.runId,
    "Tool detail run identity is inconsistent.",
  ),
  v.check(
    (record) => record.payload.kind !== "finalized" || record.payload.detail.sessionId === record.sessionId,
    "Tool detail session identity is inconsistent.",
  ),
  v.check(
    (record) => record.payload.kind !== "finalized" || record.payload.detail.tool.detailId === record.detailId,
    "Tool detail identity is inconsistent.",
  ),
)

export type SessionCacheToolDetailRecord = v.InferOutput<typeof sessionCacheToolDetailRecordSchema>

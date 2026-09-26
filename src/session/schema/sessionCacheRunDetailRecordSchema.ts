import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import { runDetailResponseSchema } from "../../run/api/runDetailResponseSchema.js"

export const sessionCacheRunDetailRecordSchema = v.pipe(
  v.strictObject({
    byteSize: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(Number.MAX_SAFE_INTEGER)),
    delegationId: v.optional(apiPublicIdSchema),
    payload: runDetailResponseSchema,
    runId: apiPublicIdSchema,
    schemaVersion: v.literal("session-cache.v1"),
    sessionId: apiPublicIdSchema,
    storedAt: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(Number.MAX_SAFE_INTEGER)),
    userId: apiPublicIdSchema,
  }),
  v.check((record) => record.payload.kind === "finalized", "Only finalized run detail may be cached."),
  v.check(
    (record) => record.payload.kind !== "finalized" || record.payload.detail.run.id === record.runId,
    "Run detail identity is inconsistent.",
  ),
  v.check(
    (record) => record.payload.kind !== "finalized" || record.payload.detail.run.sessionId === record.sessionId,
    "Run detail session identity is inconsistent.",
  ),
)

export type SessionCacheRunDetailRecord = v.InferOutput<typeof sessionCacheRunDetailRecordSchema>

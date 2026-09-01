import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import { apiRevisionSchema } from "../../api/schema/apiRevisionSchema.js"
import { journalCursorSchema } from "../../journal/schema/journalCursorSchema.js"
import { sessionSnapshotWatermarkSchema } from "../../session/api/sessionSnapshotWatermarkSchema.js"

const globalSummarySequenceSchema = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(Number.MAX_SAFE_INTEGER))
const globalSummaryTextSchema = v.pipe(v.string(), v.maxLength(4_096))
const globalSummaryResourceTypeSchema = v.picklist([
  "agent",
  "message",
  "note",
  "run",
  "server",
  "session",
  "session-list",
])
const globalSummaryFailureSchema = v.strictObject({
  code: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  message: globalSummaryTextSchema,
})
const globalSummaryChangePositionSchema = v.pipe(sessionSnapshotWatermarkSchema, v.minValue(1))
const globalSummaryBaseEntries = {
  globalSequence: globalSummarySequenceSchema,
  id: journalCursorSchema,
}

export const globalSummaryEventSchema = v.pipe(
  v.variant("eventType", [
    v.strictObject({
      ...globalSummaryBaseEntries,
      eventType: v.literal("invalidate"),
      resourceId: apiPublicIdSchema,
      resourceType: globalSummaryResourceTypeSchema,
      revision: apiRevisionSchema,
    }),
    v.strictObject({
      ...globalSummaryBaseEntries,
      eventType: v.literal("run-started"),
      runId: apiPublicIdSchema,
      sessionId: apiPublicIdSchema,
    }),
    v.strictObject({
      ...globalSummaryBaseEntries,
      changePosition: globalSummaryChangePositionSchema,
      eventType: v.literal("run-completed"),
      messageId: v.nullable(apiPublicIdSchema),
      runId: apiPublicIdSchema,
      sessionId: apiPublicIdSchema,
      sessionRevision: apiRevisionSchema,
    }),
    v.strictObject({
      ...globalSummaryBaseEntries,
      changePosition: globalSummaryChangePositionSchema,
      eventType: v.literal("run-failed"),
      failure: v.nullable(globalSummaryFailureSchema),
      runId: apiPublicIdSchema,
      sessionId: apiPublicIdSchema,
      sessionRevision: apiRevisionSchema,
    }),
    v.strictObject({
      ...globalSummaryBaseEntries,
      changePosition: globalSummaryChangePositionSchema,
      eventType: v.literal("run-cancelled"),
      reason: v.optional(globalSummaryTextSchema),
      runId: apiPublicIdSchema,
      sessionId: apiPublicIdSchema,
      sessionRevision: apiRevisionSchema,
    }),
    v.strictObject({
      ...globalSummaryBaseEntries,
      changePosition: globalSummaryChangePositionSchema,
      eventType: v.literal("run-interrupted"),
      reason: globalSummaryTextSchema,
      runId: apiPublicIdSchema,
      sessionId: apiPublicIdSchema,
      sessionRevision: apiRevisionSchema,
    }),
    v.strictObject({
      ...globalSummaryBaseEntries,
      eventType: v.literal("input-needed"),
      requestId: apiPublicIdSchema,
      runId: apiPublicIdSchema,
      sessionId: apiPublicIdSchema,
      sessionRevision: apiRevisionSchema,
      summary: v.optional(globalSummaryTextSchema),
    }),
    v.strictObject({
      ...globalSummaryBaseEntries,
      asOfGlobalSequence: globalSummarySequenceSchema,
      eventType: v.literal("reset"),
      reason: v.picklist(["cursor-expired", "cursor-invalid", "journal-unavailable"]),
    }),
  ]),
  v.check(
    (event) => event.eventType === "reset" || event.globalSequence > 0,
    "The global summary sequence must be positive.",
  ),
  v.check(
    (event) => event.eventType !== "reset" || event.asOfGlobalSequence === event.globalSequence,
    "The global reset watermark must match its sequence.",
  ),
)

export type GlobalSummaryEvent = v.InferOutput<typeof globalSummaryEventSchema>

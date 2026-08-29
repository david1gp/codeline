import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import { apiRevisionSchema } from "../../api/schema/apiRevisionSchema.js"
import { apiSequenceSchema } from "../../api/schema/apiSequenceSchema.js"
import { journalEventIdSchema } from "./journalEventIdSchema.js"

const journalEventBaseEntries = {
  id: journalEventIdSchema,
  sequence: apiSequenceSchema,
}
const journalResourceTypeSchema = v.picklist(["agent", "message", "note", "run", "server", "session", "session-list"])
const journalRunFailureSchema = v.strictObject({
  code: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  message: v.pipe(v.string(), v.maxLength(4_096)),
})

export const journalEventSchema = v.variant("eventType", [
  v.strictObject({
    ...journalEventBaseEntries,
    eventType: v.literal("invalidate"),
    resourceId: apiPublicIdSchema,
    resourceType: journalResourceTypeSchema,
    revision: apiRevisionSchema,
  }),
  v.strictObject({
    ...journalEventBaseEntries,
    delta: v.string(),
    deltaKind: v.picklist(["text", "thinking", "tool"]),
    eventType: v.literal("delta"),
    messageId: v.nullable(apiPublicIdSchema),
    runId: apiPublicIdSchema,
    sessionId: apiPublicIdSchema,
  }),
  v.strictObject({
    ...journalEventBaseEntries,
    eventType: v.literal("run-started"),
    runId: apiPublicIdSchema,
    sessionId: apiPublicIdSchema,
  }),
  v.strictObject({
    ...journalEventBaseEntries,
    eventType: v.literal("run-completed"),
    messageId: v.nullable(apiPublicIdSchema),
    runId: apiPublicIdSchema,
    sessionId: apiPublicIdSchema,
    sessionRevision: apiRevisionSchema,
  }),
  v.strictObject({
    ...journalEventBaseEntries,
    eventType: v.literal("run-failed"),
    failure: v.nullable(journalRunFailureSchema),
    runId: apiPublicIdSchema,
    sessionId: apiPublicIdSchema,
    sessionRevision: apiRevisionSchema,
  }),
  v.strictObject({
    ...journalEventBaseEntries,
    eventType: v.literal("run-cancelled"),
    reason: v.optional(v.pipe(v.string(), v.maxLength(200))),
    runId: apiPublicIdSchema,
    sessionId: apiPublicIdSchema,
    sessionRevision: apiRevisionSchema,
  }),
  v.strictObject({
    ...journalEventBaseEntries,
    eventType: v.literal("run-interrupted"),
    reason: v.pipe(v.string(), v.maxLength(200)),
    runId: apiPublicIdSchema,
    sessionId: apiPublicIdSchema,
    sessionRevision: apiRevisionSchema,
  }),
  v.strictObject({
    ...journalEventBaseEntries,
    asOfSequence: apiSequenceSchema,
    eventType: v.literal("reset"),
    reason: v.picklist(["cursor-expired", "cursor-invalid", "journal-unavailable"]),
  }),
])

export type JournalEvent = v.InferOutput<typeof journalEventSchema>

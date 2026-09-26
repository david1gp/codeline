import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import { journalCursorSchema } from "../../journal/schema/journalCursorSchema.js"
import { journalJsonValueSchema } from "../../journal/schema/journalJsonValueSchema.js"
import { sessionSnapshotWatermarkSchema } from "./sessionSnapshotWatermarkSchema.js"

const sessionDetailEntryKindSchema = v.picklist(["message", "run", "tool"])
const sessionDetailEntrySourceDetailIdSchema = v.pipe(v.string(), v.maxLength(256))
const sessionDetailEntrySourceIdSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(256))
const sessionDetailEventPositionSchema = v.pipe(sessionSnapshotWatermarkSchema, v.minValue(1))

export const sessionDetailEventSchema = v.variant("eventType", [
  v.strictObject({
    changePosition: sessionDetailEventPositionSchema,
    entryId: apiPublicIdSchema,
    eventType: v.literal("entry"),
    id: journalCursorSchema,
    kind: sessionDetailEntryKindSchema,
    payload: journalJsonValueSchema,
    position: sessionDetailEventPositionSchema,
    sessionId: apiPublicIdSchema,
    sourceDetailId: sessionDetailEntrySourceDetailIdSchema,
    sourceId: sessionDetailEntrySourceIdSchema,
    sourceType: sessionDetailEntryKindSchema,
  }),
  v.strictObject({
    asOfPosition: sessionSnapshotWatermarkSchema,
    eventType: v.literal("reset"),
    id: journalCursorSchema,
    reason: v.picklist(["cursor-expired", "cursor-invalid", "session-unavailable"]),
    sessionId: apiPublicIdSchema,
  }),
])

export type SessionDetailEvent = v.InferOutput<typeof sessionDetailEventSchema>

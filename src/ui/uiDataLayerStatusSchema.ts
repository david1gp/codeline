import * as v from "valibot"
import { apiPublicIdSchema } from "../api/schema/apiPublicIdSchema.js"
import { apiRevisionSchema } from "../api/schema/apiRevisionSchema.js"
import { apiSequenceSchema } from "../api/schema/apiSequenceSchema.js"
import { journalEventIdSchema } from "../stream/schema/journalEventIdSchema.js"

const uiResourceTypeSchema = v.picklist(["agent", "message", "note", "run", "server", "session", "session-list"])

export const uiDataLayerStatusSchema = v.variant("status", [
  v.strictObject({
    asOfSequence: apiSequenceSchema,
    lastEventId: v.nullable(journalEventIdSchema),
    status: v.literal("connected"),
  }),
  v.strictObject({
    attempt: v.pipe(v.number(), v.integer(), v.minValue(1)),
    lastEventId: v.nullable(journalEventIdSchema),
    status: v.literal("reconnecting"),
  }),
  v.strictObject({
    reason: v.picklist(["bootstrap", "reset", "resource-stale", "run-checkpoint"]),
    status: v.literal("reconciling"),
  }),
  v.strictObject({
    accountId: v.nullable(apiPublicIdSchema),
    status: v.literal("offline"),
  }),
  v.strictObject({
    cachedRevision: apiRevisionSchema,
    resourceId: apiPublicIdSchema,
    resourceType: uiResourceTypeSchema,
    serverRevision: v.optional(apiRevisionSchema),
    status: v.literal("stale"),
  }),
])

export type UiDataLayerStatus = v.InferOutput<typeof uiDataLayerStatusSchema>

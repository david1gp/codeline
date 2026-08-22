import * as v from "valibot"
import { apiPublicIdSchema } from "../api/schema/apiPublicIdSchema.js"
import { apiRevisionSchema } from "../api/schema/apiRevisionSchema.js"
import { eventFeedCursorSchema } from "../stream/client/eventFeedCursorSchema.js"

const uiResourceTypeSchema = v.picklist(["agent", "message", "note", "run", "server", "session", "session-list"])

export const uiDataLayerStatusSchema = v.variant("status", [
  v.strictObject({
    asOfCursor: v.nullable(eventFeedCursorSchema),
    lastEventId: v.nullable(eventFeedCursorSchema),
    status: v.literal("connected"),
  }),
  v.strictObject({
    attempt: v.pipe(v.number(), v.integer(), v.minValue(1)),
    lastEventId: v.nullable(eventFeedCursorSchema),
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

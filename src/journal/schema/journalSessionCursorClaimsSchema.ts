import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import { sessionSnapshotWatermarkSchema } from "../../session/api/sessionSnapshotWatermarkSchema.js"

export const journalSessionCursorClaimsSchema = v.strictObject({
  changePosition: sessionSnapshotWatermarkSchema,
  sessionId: apiPublicIdSchema,
  userId: apiPublicIdSchema,
  version: v.literal(1),
})

export type JournalSessionCursorClaims = v.InferOutput<typeof journalSessionCursorClaimsSchema>

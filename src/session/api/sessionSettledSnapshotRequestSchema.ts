import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"

export const sessionSettledSnapshotRequestSchema = v.strictObject({
  sessionId: apiPublicIdSchema,
})

export type SessionSettledSnapshotRequest = v.InferOutput<typeof sessionSettledSnapshotRequestSchema>

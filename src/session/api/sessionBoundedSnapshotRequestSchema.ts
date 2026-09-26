import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"

export const sessionBoundedSnapshotRequestSchema = v.strictObject({
  sessionId: apiPublicIdSchema,
})

export type SessionBoundedSnapshotRequest = v.InferOutput<typeof sessionBoundedSnapshotRequestSchema>

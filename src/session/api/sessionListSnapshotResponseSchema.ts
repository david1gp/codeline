import * as v from "valibot"
import { apiCursorSchema } from "../../api/schema/apiCursorSchema.js"
import { apiRepresentationMetadataSchema } from "../../api/schema/apiRepresentationMetadataSchema.js"
import { runActiveSummarySchema } from "../../run/api/runActiveSummarySchema.js"
import { sessionShellSchema } from "./sessionShellSchema.js"

export const sessionListSnapshotResponseSchema = v.strictObject({
  ...apiRepresentationMetadataSchema.entries,
  activeRuns: v.array(runActiveSummarySchema),
  nextCursor: v.nullable(apiCursorSchema),
  sessions: v.array(sessionShellSchema),
})

export type SessionListSnapshotResponse = v.InferOutput<typeof sessionListSnapshotResponseSchema>

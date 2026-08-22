import * as v from "valibot"
import { apiCursorSchema } from "../../api/schema/apiCursorSchema.js"
import { apiEtagSchema } from "../../api/schema/apiEtagSchema.js"
import { apiRepresentationMetadataSchema } from "../../api/schema/apiRepresentationMetadataSchema.js"
import { apiRevisionSchema } from "../../api/schema/apiRevisionSchema.js"
import { runActiveSummarySchema } from "../../run/api/runActiveSummarySchema.js"
import { sessionShellSchema } from "./sessionShellSchema.js"

const legacySessionListSnapshotResponseSchema = v.strictObject({
  ...apiRepresentationMetadataSchema.entries,
  activeRuns: v.array(runActiveSummarySchema),
  nextCursor: v.nullable(apiCursorSchema),
  sessions: v.array(sessionShellSchema),
})

const sessionListSnapshotResponseV2Schema = v.strictObject({
  asOfCursor: apiCursorSchema,
  nextCursor: v.nullable(apiCursorSchema),
  sessions: v.array(sessionShellSchema),
})

export const sessionListSnapshotResponseV3Schema = v.strictObject({
  asOfCursor: apiCursorSchema,
  etag: apiEtagSchema,
  nextCursor: v.nullable(apiCursorSchema),
  revision: apiRevisionSchema,
  schemaVersion: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(64)),
  sessions: v.array(sessionShellSchema),
})

export const sessionListSnapshotResponseSchema = v.union([
  legacySessionListSnapshotResponseSchema,
  sessionListSnapshotResponseV2Schema,
  sessionListSnapshotResponseV3Schema,
])

export type SessionListSnapshotResponse = v.InferOutput<typeof sessionListSnapshotResponseSchema>

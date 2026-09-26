import * as v from "valibot"
import { apiCursorSchema } from "../../api/schema/apiCursorSchema.js"
import { apiEtagSchema } from "../../api/schema/apiEtagSchema.js"
import { apiRevisionSchema } from "../../api/schema/apiRevisionSchema.js"
import { sessionShellSchema } from "./sessionShellSchema.js"

export const sessionListSnapshotResponseV3Schema = v.strictObject({
  asOfCursor: apiCursorSchema,
  etag: apiEtagSchema,
  nextCursor: v.nullable(apiCursorSchema),
  revision: apiRevisionSchema,
  schemaVersion: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(64)),
  sessions: v.array(sessionShellSchema),
})

export const sessionListSnapshotResponseSchema = sessionListSnapshotResponseV3Schema

export type SessionListSnapshotResponse = v.InferOutput<typeof sessionListSnapshotResponseSchema>

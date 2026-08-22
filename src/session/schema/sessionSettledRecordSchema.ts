import * as v from "valibot"
import { apiEtagSchema } from "../../api/schema/apiEtagSchema.js"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import { apiRevisionSchema } from "../../api/schema/apiRevisionSchema.js"
import { apiSequenceSchema } from "../../api/schema/apiSequenceSchema.js"
import { sessionSnapshotPayloadSchema } from "../api/sessionSnapshotPayloadSchema.js"

export const sessionSettledRecordSchema = v.strictObject({
  asOfSequence: apiSequenceSchema,
  etag: apiEtagSchema,
  payload: sessionSnapshotPayloadSchema,
  revision: apiRevisionSchema,
  schemaVersion: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(64)),
  sessionId: apiPublicIdSchema,
  userId: apiPublicIdSchema,
})

export type SessionSettledRecord = v.InferOutput<typeof sessionSettledRecordSchema>

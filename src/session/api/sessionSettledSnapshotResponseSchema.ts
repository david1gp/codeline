import * as v from "valibot"
import { apiCursorSchema } from "../../api/schema/apiCursorSchema.js"
import { apiEtagSchema } from "../../api/schema/apiEtagSchema.js"
import { apiRevisionSchema } from "../../api/schema/apiRevisionSchema.js"
import { apiSequenceSchema } from "../../api/schema/apiSequenceSchema.js"
import { sessionSnapshotPayloadSchema } from "./sessionSnapshotPayloadSchema.js"

export const sessionSettledSnapshotResponseSchema = v.strictObject({
  ...sessionSnapshotPayloadSchema.entries,
  asOfCursor: apiCursorSchema,
  asOfSequence: v.optional(apiSequenceSchema),
  etag: apiEtagSchema,
  revision: apiRevisionSchema,
  schemaVersion: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(64)),
})

export type SessionSettledSnapshotResponse = v.InferOutput<typeof sessionSettledSnapshotResponseSchema>

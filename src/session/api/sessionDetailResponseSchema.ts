import * as v from "valibot"
import { apiCursorSchema } from "../../api/schema/apiCursorSchema.js"
import { apiEtagSchema } from "../../api/schema/apiEtagSchema.js"
import { apiRevisionSchema } from "../../api/schema/apiRevisionSchema.js"
import { sessionResourceReferenceSchema } from "./sessionResourceReferenceSchema.js"
import { sessionShellSchema } from "./sessionShellSchema.js"

export const sessionDetailResponseSchema = v.strictObject({
  agent: sessionResourceReferenceSchema,
  asOfCursor: v.optional(apiCursorSchema),
  etag: apiEtagSchema,
  revision: apiRevisionSchema,
  schemaVersion: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(64)),
  server: sessionResourceReferenceSchema,
  session: sessionShellSchema,
})

export type SessionDetailResponse = v.InferOutput<typeof sessionDetailResponseSchema>

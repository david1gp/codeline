import * as v from "valibot"
import { apiCursorSchema } from "../../api/schema/apiCursorSchema.js"
import { apiEtagSchema } from "../../api/schema/apiEtagSchema.js"
import { apiRevisionSchema } from "../../api/schema/apiRevisionSchema.js"
import { messageApiRecordSchema } from "./messageApiRecordSchema.js"

export const messagePageResponseSchema = v.pipe(
  v.strictObject({
    asOfCursor: apiCursorSchema,
    etag: apiEtagSchema,
    hasMore: v.boolean(),
    messages: v.array(messageApiRecordSchema),
    nextCursor: v.nullable(apiCursorSchema),
    revision: apiRevisionSchema,
    schemaVersion: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(64)),
  }),
  v.check((page) => page.hasMore === (page.nextCursor !== null), "Page completion does not match nextCursor."),
)

export type MessagePageResponse = v.InferOutput<typeof messagePageResponseSchema>

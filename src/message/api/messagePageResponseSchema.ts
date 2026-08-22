import * as v from "valibot"
import { apiCursorSchema } from "../../api/schema/apiCursorSchema.js"
import { apiRepresentationMetadataSchema } from "../../api/schema/apiRepresentationMetadataSchema.js"
import { messageApiRecordSchema } from "./messageApiRecordSchema.js"

export const messagePageResponseSchema = v.strictObject({
  ...apiRepresentationMetadataSchema.entries,
  messages: v.array(messageApiRecordSchema),
  nextCursor: v.nullable(apiCursorSchema),
})

export type MessagePageResponse = v.InferOutput<typeof messagePageResponseSchema>

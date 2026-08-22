import * as v from "valibot"
import { messageApiRecordSchema } from "./messageApiRecordSchema.js"

export const messageAppendResponseSchema = v.strictObject({
  created: v.boolean(),
  message: messageApiRecordSchema,
})

export type MessageAppendResponse = v.InferOutput<typeof messageAppendResponseSchema>

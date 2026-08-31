import * as v from "valibot"
import { messageApiRecordSchema } from "../../message/api/messageApiRecordSchema.js"

const assistantMessageApiRecordSchema = v.pipe(
  messageApiRecordSchema,
  v.check((message) => message.role === "assistant", "The latest answer must be an assistant message."),
)

export const sessionLatestAnswerSchema = v.nullable(assistantMessageApiRecordSchema)

export type SessionLatestAnswer = v.InferOutput<typeof sessionLatestAnswerSchema>

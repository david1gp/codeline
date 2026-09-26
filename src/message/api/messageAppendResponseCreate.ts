import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { messageApiRecordCreate } from "./messageApiRecordCreate.js"
import { type MessageAppendResponse, messageAppendResponseSchema } from "./messageAppendResponseSchema.js"

type MessageAppendResponseSource = Parameters<typeof messageApiRecordCreate>[0]

export function messageAppendResponseCreate(input: {
  created: boolean
  message: MessageAppendResponseSource
}): Result<MessageAppendResponse> {
  const op = "messageAppendResponseCreate"
  const message = messageApiRecordCreate(input.message)
  if (!message.success) return createResultError(op, message.errorMessage)

  const parsed = v.safeParse(messageAppendResponseSchema, { created: input.created, message: message.data })
  if (!parsed.success) return createResultError(op, "The message mutation response is invalid.")
  return createResult(parsed.output)
}

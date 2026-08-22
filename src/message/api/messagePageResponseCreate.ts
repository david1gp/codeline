import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { apiRepresentationEtagCreate } from "../../api/representation/apiRepresentationEtagCreate.js"
import { messageApiRecordCreate } from "./messageApiRecordCreate.js"
import { type MessagePageResponse, messagePageResponseSchema } from "./messagePageResponseSchema.js"
import { messagePageSchemaVersion } from "./messagePageSchemaVersion.js"

type MessagePageSource = Parameters<typeof messageApiRecordCreate>[0]

export function messagePageResponseCreate(input: {
  asOfCursor: string
  cursor?: string
  hasMore: boolean
  limit: number
  messages: MessagePageSource[]
  nextCursor: string | null
  revision: number
  sessionId: string
}): Result<MessagePageResponse> {
  const op = "messagePageResponseCreate"
  const messages = []
  for (const source of input.messages) {
    const message = messageApiRecordCreate(source)
    if (!message.success) return createResultError(op, message.errorMessage)
    messages.push(message.data)
  }

  const parsed = v.safeParse(messagePageResponseSchema, {
    asOfCursor: input.asOfCursor,
    etag: apiRepresentationEtagCreate(
      `session-messages:${input.sessionId}:${input.cursor ?? ""}:${input.limit}:asOf:${input.asOfCursor}`,
      messagePageSchemaVersion,
      input.revision,
    ),
    hasMore: input.hasMore,
    messages,
    nextCursor: input.nextCursor,
    revision: input.revision,
    schemaVersion: messagePageSchemaVersion,
  })
  if (!parsed.success) return createResultError(op, "The message page representation is invalid.")
  return createResult(parsed.output)
}

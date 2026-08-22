import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { messageApiRecordCreate } from "../../message/api/messageApiRecordCreate.js"
import {
  sessionSettledSnapshotResponseSchema,
  type SessionSettledSnapshotResponse,
} from "./sessionSettledSnapshotResponseSchema.js"
import { sessionShellCreate } from "./sessionShellCreate.js"

type SessionSettledSnapshotMessage = Parameters<typeof messageApiRecordCreate>[0]

export function sessionSettledSnapshotResponseCreate(input: {
  asOfCursor: string
  etag: string
  messages: SessionSettledSnapshotMessage[]
  revision: number
  schemaVersion: string
  session: Parameters<typeof sessionShellCreate>[0]
}): Result<SessionSettledSnapshotResponse> {
  const op = "sessionSettledSnapshotResponseCreate"
  const session = sessionShellCreate(input.session)
  if (!session.success) return session

  const messages = []
  for (const messageInput of input.messages) {
    const message = messageApiRecordCreate(messageInput)
    if (!message.success) return createResultError(op, message.errorMessage)
    messages.push(message.data)
  }

  const parsed = v.safeParse(sessionSettledSnapshotResponseSchema, {
    asOfCursor: input.asOfCursor,
    etag: input.etag,
    messages,
    revision: input.revision,
    schemaVersion: input.schemaVersion,
    session: session.data,
    settled: true,
  })
  if (!parsed.success) return createResultError(op, "The settled session snapshot representation is invalid.")
  return createResult(parsed.output)
}

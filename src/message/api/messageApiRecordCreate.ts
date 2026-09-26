import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { type MessageApiRecord, messageApiRecordSchema } from "./messageApiRecordSchema.js"

type MessageApiRecordSource = {
  agentId: string
  clientRequestId: string
  content: string
  createdAt: Date | string
  finalizedAt: Date | string
  id: string
  metadata: unknown
  role: string
  sequence: number
  sessionId: string
}

export function messageApiRecordCreate(message: MessageApiRecordSource): Result<MessageApiRecord> {
  const op = "messageApiRecordCreate"
  const createdAt = messageTimestampSerialize(message.createdAt)
  const finalizedAt = messageTimestampSerialize(message.finalizedAt)
  if (createdAt === undefined || finalizedAt === undefined)
    return createResultError(op, "The message representation timestamp is invalid.")

  const parsed = v.safeParse(messageApiRecordSchema, {
    agentId: message.agentId,
    clientRequestId: message.clientRequestId,
    content: message.content,
    createdAt,
    finalizedAt,
    id: message.id,
    metadata: message.metadata,
    role: message.role,
    sequence: message.sequence,
    sessionId: message.sessionId,
  })
  if (!parsed.success) return createResultError(op, "The message representation is invalid.")
  return createResult(parsed.output)
}

function messageTimestampSerialize(value: Date | string): string | undefined {
  if (typeof value === "string") return value
  if (Number.isNaN(value.getTime())) return undefined
  return value.toISOString()
}

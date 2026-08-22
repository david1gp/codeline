import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericMutationCtx } from "convex/server"
import * as v from "valibot"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { messageAppendRequestSchema } from "../schema/messageAppendRequestSchema.js"
import type { MessageRecord } from "./messageRecord.js"

type MessageMutationContext = Pick<GenericMutationCtx<any>, "db">

type MessageDocument = MessageRecord & { _id?: string }

function messageDocumentPublic(document: MessageDocument): MessageRecord {
  return {
    agentId: document.agentId,
    clientRequestId: document.clientRequestId,
    content: document.content,
    createdAt: document.createdAt,
    finalizedAt: document.finalizedAt,
    id: document.id,
    metadata: document.metadata,
    role: document.role,
    sequence: document.sequence,
    sessionId: document.sessionId,
  }
}

export async function messageAppend(
  context: MessageMutationContext,
  userId: string,
  sessionId: string,
  input: unknown,
  now = Date.now(),
): Promise<Result<{ created: boolean; message: MessageRecord }>> {
  const op = "messageAppend"
  const parsed = v.safeParse(messageAppendRequestSchema, input)
  if (!parsed.success) return createResultError(op, "The message input is invalid.")

  try {
    const session = await context.db
      .query("sessions")
      .withIndex("userIdId", (query: any) => query.eq("userId", userId).eq("id", sessionId))
      .first()
    if (session === null) return createResultError(op, "The session could not be found.")
    if (session.archivedAt !== undefined) return createResultError(op, "The session is archived.")

    const existing = await context.db
      .query("messages")
      .withIndex("sessionIdClientRequestId", (query: any) =>
        query.eq("sessionId", sessionId).eq("clientRequestId", parsed.output.clientRequestId),
      )
      .first()
    if (existing !== null) {
      if (existing.role === parsed.output.role && existing.content === parsed.output.content)
        return createResult({ created: false, message: messageDocumentPublic(existing) })
      return createResultError(op, "The message client request ID was already used with different content.")
    }

    const last = await context.db
      .query("messages")
      .withIndex("sessionIdSequence", (query: any) => query.eq("sessionId", sessionId))
      .order("desc")
      .first()
    const document: MessageRecord = {
      agentId: session.primaryAgentId,
      clientRequestId: parsed.output.clientRequestId,
      content: parsed.output.content,
      createdAt: now,
      finalizedAt: now,
      id: uuidv7(),
      metadata: {},
      role: parsed.output.role,
      sequence: (last?.sequence ?? 0) + 1,
      sessionId,
    }
    const sequenced = await context.db
      .query("messages")
      .withIndex("sessionIdSequence", (query: any) =>
        query.eq("sessionId", sessionId).eq("sequence", document.sequence),
      )
      .first()
    if (sequenced !== null) return createResultError(op, "The message sequence conflicts with an existing message.")
    await context.db.insert("messages", document)
    await context.db.patch("sessions", session._id, { updatedAt: now })
    return createResult({ created: true, message: document })
  } catch (_error) {
    return createResultError(op, "The message could not be appended.")
  }
}

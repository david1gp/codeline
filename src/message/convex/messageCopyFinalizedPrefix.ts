import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericMutationCtx } from "convex/server"
import { uuidv7 } from "../../uuid/uuidv7.js"
import type { MessageRecord } from "./messageRecord.js"

type MessageMutationContext = Pick<GenericMutationCtx<any>, "db">

export async function messageCopyFinalizedPrefix(
  context: MessageMutationContext,
  userId: string,
  sourceSessionId: string,
  targetSessionId: string,
  messageId: string,
): Promise<Result<MessageRecord[]>> {
  const op = "messageCopyFinalizedPrefix"
  try {
    const target = await context.db
      .query("sessions")
      .withIndex("userIdId", (query: any) => query.eq("userId", userId).eq("id", targetSessionId))
      .first()
    if (target === null) return createResultError(op, "The target session could not be found.")
    const source = await context.db
      .query("sessions")
      .withIndex("userIdId", (query: any) => query.eq("userId", userId).eq("id", sourceSessionId))
      .first()
    if (source === null) return createResultError(op, "The message could not be found.")

    const selected = await context.db
      .query("messages")
      .withIndex("id", (query: any) => query.eq("id", messageId))
      .first()
    if (
      selected === null ||
      selected.sessionId !== sourceSessionId ||
      selected.finalizedAt === undefined ||
      (selected.role !== "user" && selected.role !== "assistant")
    )
      return createResultError(op, "The message could not be found.")

    const sourceMessages = (await context.db
      .query("messages")
      .withIndex("sessionIdSequence", (query: any) =>
        query.eq("sessionId", sourceSessionId).lte("sequence", selected.sequence),
      )
      .order("asc")
      .collect()) as MessageRecord[]
    const prefix = sourceMessages.filter(
      (message) => message.finalizedAt !== undefined && (message.role === "user" || message.role === "assistant"),
    )
    if (!prefix.some((message) => message.id === selected.id))
      return createResultError(op, "The finalized message prefix could not be loaded.")

    const targetMessages = (await context.db
      .query("messages")
      .withIndex("sessionIdSequence", (query: any) => query.eq("sessionId", targetSessionId))
      .collect()) as MessageRecord[]
    if (
      prefix.some((message) =>
        targetMessages.some((targetMessage) => targetMessage.clientRequestId === message.clientRequestId),
      )
    )
      return createResultError(op, "The finalized message prefix could not be copied.")

    const copied = prefix.map((message, index) => ({
      agentId: message.agentId,
      clientRequestId: message.clientRequestId,
      content: message.content,
      createdAt: message.createdAt,
      finalizedAt: message.finalizedAt,
      id: uuidv7(),
      metadata: message.metadata,
      role: message.role,
      sequence: index + 1,
      sessionId: targetSessionId,
    }))
    for (const message of copied) await context.db.insert("messages", message)
    return createResult(copied)
  } catch (_error) {
    return createResultError(op, "The finalized message prefix could not be copied.")
  }
}

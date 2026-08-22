import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericQueryCtx } from "convex/server"
import type { MessageRecord } from "./messageRecord.js"

type MessageQueryContext = Pick<GenericQueryCtx<any>, "db">

export async function messageLoadDurableHistory(
  context: MessageQueryContext,
  userId: string,
  sessionId: string,
): Promise<Result<MessageRecord[]>> {
  const op = "messageLoadDurableHistory"
  try {
    const session = await context.db
      .query("sessions")
      .withIndex("userIdId", (query: any) => query.eq("userId", userId).eq("id", sessionId))
      .first()
    if (session === null) return createResultError(op, "The session could not be found.")

    const messages = await context.db
      .query("messages")
      .withIndex("sessionIdSequence", (query: any) => query.eq("sessionId", sessionId))
      .order("asc")
      .collect()
    return createResult(
      messages.map((message: MessageRecord) => ({
        agentId: message.agentId,
        clientRequestId: message.clientRequestId,
        content: message.content,
        createdAt: message.createdAt,
        finalizedAt: message.finalizedAt,
        id: message.id,
        metadata: message.metadata,
        role: message.role,
        sequence: message.sequence,
        sessionId: message.sessionId,
      })),
    )
  } catch (_error) {
    return createResultError(op, "The durable message history could not be loaded.")
  }
}

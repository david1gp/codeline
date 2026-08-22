import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericMutationCtx } from "convex/server"
import { messageAppend } from "./messageAppend.js"
import { messageLoadDurableHistory } from "./messageLoadDurableHistory.js"
import type { MessageRecord } from "./messageRecord.js"

type MessageMutationContext = Pick<GenericMutationCtx<any>, "db">

export async function messagePrepare(
  context: MessageMutationContext,
  userId: string,
  sessionId: string,
  input: { clientRequestId: string; content: string },
): Promise<Result<{ history: MessageRecord[]; userMessage: MessageRecord }>> {
  const op = "messagePrepare"
  const appended = await messageAppend(context, userId, sessionId, { ...input, role: "user" })
  if (!appended.success) return createResultError(op, appended.errorMessage)
  const history = await messageLoadDurableHistory(context, userId, sessionId)
  if (!history.success) return createResultError(op, history.errorMessage)
  return createResult({ history: history.data, userMessage: appended.data.message })
}

import type { CompactionMessage } from "../../compaction/compactionMessage.js"

type SessionChatContextToolLifecycleResolution = {
  complete: boolean
  suffix: Array<CompactionMessage>
}

function sessionChatContextPreparedUserMessageMatches(
  message: CompactionMessage,
  preparedUserMessage: { id: string; sequence: number },
): boolean {
  if (message.role !== "user") return false
  if (message.id !== undefined) return message.id === preparedUserMessage.id
  return message.sequence === preparedUserMessage.sequence
}

function sessionChatContextPreparedUserIndexResolve(
  history: readonly CompactionMessage[],
  preparedUserMessage?: { id: string; sequence: number },
): number {
  if (preparedUserMessage !== undefined) {
    return history.findLastIndex((message) =>
      sessionChatContextPreparedUserMessageMatches(message, preparedUserMessage),
    )
  }
  return history.findLastIndex(
    (message) => message.role === "user" && (message.id !== undefined || message.sequence !== undefined),
  )
}

function sessionChatContextToolLifecycleComplete(history: readonly CompactionMessage[]): boolean {
  const pendingToolCallIds = new Set<string>()
  const assistantToolCallIds = new Set<string>()
  let lifecycleFound = false
  for (const message of history) {
    if (message.role === "assistant" && (message.toolCalls?.length ?? 0) > 0) {
      lifecycleFound = true
      for (const toolCall of message.toolCalls ?? []) {
        const toolCallId = toolCall.toolCallId ?? toolCall.id
        if (toolCallId === undefined || toolCallId.length === 0) return false
        if (assistantToolCallIds.has(toolCallId)) return false
        assistantToolCallIds.add(toolCallId)
        pendingToolCallIds.add(toolCallId)
      }
    }
    if (message.role !== "tool") continue
    lifecycleFound = true
    const toolCallId =
      message.toolCallId ??
      (typeof message.metadata === "object" && message.metadata !== null && "toolCallId" in message.metadata
        ? typeof message.metadata.toolCallId === "string"
          ? message.metadata.toolCallId
          : undefined
        : undefined)
    if (toolCallId === undefined || toolCallId.length === 0 || !pendingToolCallIds.delete(toolCallId)) return false
  }
  return !lifecycleFound || pendingToolCallIds.size === 0
}

function sessionChatContextToolLifecycleMessagesFind(history: readonly CompactionMessage[]): boolean {
  return history.some(
    (message) => message.role === "tool" || (message.role === "assistant" && (message.toolCalls?.length ?? 0) > 0),
  )
}

export function sessionChatContextToolLifecycleResolve(
  history: readonly CompactionMessage[],
  preparedUserMessage?: { id: string; sequence: number },
): SessionChatContextToolLifecycleResolution {
  const preparedUserIndex = sessionChatContextPreparedUserIndexResolve(history, preparedUserMessage)
  if (preparedUserIndex < 0) return { complete: !sessionChatContextToolLifecycleMessagesFind(history), suffix: [] }
  const suffix = [...history.slice(preparedUserIndex + 1)]
  return { complete: sessionChatContextToolLifecycleComplete(suffix), suffix }
}

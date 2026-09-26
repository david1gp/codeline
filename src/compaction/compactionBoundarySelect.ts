import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { CompactionBoundarySelection } from "./compactionBoundarySelection.js"
import type { CompactionMessage } from "./compactionMessage.js"
import { compactionTokenEstimate } from "./compactionTokenEstimate.js"

function compactionToolCallIds(message: CompactionMessage): Set<string> {
  const ids = new Set<string>()
  for (const call of message.toolCalls ?? []) {
    const id = call.toolCallId ?? call.id
    if (id !== undefined && id.length > 0) ids.add(id)
  }
  const visit = (value: unknown): void => {
    if (typeof value !== "object" || value === null) return
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }
    const record = value as Record<string, unknown>
    if (typeof record.toolCallId === "string" && record.toolCallId.length > 0) ids.add(record.toolCallId)
    if (record.type === "tool-call" && typeof record.id === "string" && record.id.length > 0) ids.add(record.id)
    for (const item of Object.values(record)) visit(item)
  }
  visit(message.content)
  visit(message.metadata)
  return ids
}

function compactionToolResultId(message: CompactionMessage): string | undefined {
  if (message.toolCallId !== undefined && message.toolCallId.length > 0) return message.toolCallId
  if (typeof message.metadata !== "object" || message.metadata === null) return undefined
  const toolCallId = (message.metadata as Record<string, unknown>).toolCallId
  return typeof toolCallId === "string" && toolCallId.length > 0 ? toolCallId : undefined
}

function compactionUnsafeBoundaryStart(messages: readonly CompactionMessage[], candidate: number): number | undefined {
  for (let start = 0; start < candidate; start += 1) {
    const message = messages[start]
    if (message === undefined || message.role !== "assistant") continue
    const callIds = compactionToolCallIds(message)
    for (const callId of callIds) {
      let resultIndex: number | undefined
      for (let index = start + 1; index < messages.length; index += 1) {
        const possibleResult = messages[index]
        if (possibleResult?.role === "tool" && compactionToolResultId(possibleResult) === callId) {
          resultIndex = index
          break
        }
      }
      if (resultIndex === undefined && candidate > start) return start
      if (resultIndex !== undefined && candidate > start && candidate <= resultIndex) return start
    }
  }
  return undefined
}

export function compactionBoundarySelect(input: {
  messages: readonly CompactionMessage[]
  recentTokenBudget: number
}): Result<CompactionBoundarySelection> {
  const op = "compactionBoundarySelect"
  if (!Number.isSafeInteger(input.recentTokenBudget) || input.recentTokenBudget < 0) {
    return createResultError(op, "recentTokenBudget must be a non-negative integer.")
  }
  const estimates: number[] = []
  for (const message of input.messages) {
    const result = compactionTokenEstimate(message)
    if (!result.success) return result
    estimates.push(result.data)
  }
  let cutIndex = input.messages.length
  let retainedTokenEstimate = 0
  while (cutIndex > 0 && retainedTokenEstimate < input.recentTokenBudget) {
    cutIndex -= 1
    retainedTokenEstimate += estimates[cutIndex] ?? 0
  }
  while (cutIndex > 0) {
    const safeStart = compactionUnsafeBoundaryStart(input.messages, cutIndex)
    if (safeStart === undefined) break
    cutIndex = safeStart
    retainedTokenEstimate = estimates.slice(cutIndex).reduce((total, estimate) => total + estimate, 0)
  }
  return createResult({
    compacted: input.messages.slice(0, cutIndex),
    cutIndex,
    retained: input.messages.slice(cutIndex),
    retainedTokenEstimate,
  })
}

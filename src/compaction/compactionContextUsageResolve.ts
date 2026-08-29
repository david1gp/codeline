import type { CompactionMessage } from "./compactionMessage.js"
import type { CompactionTokenUsage } from "./compactionTokenUsage.js"
import { compactionTokenEstimate } from "./compactionTokenEstimate.js"
import { compactionTokenUsageResolve } from "./compactionTokenUsageResolve.js"

type CompactionContextUsageResolution = {
  estimatedTrailingInputTokens?: number
  reportedUsage?: CompactionTokenUsage
}

function compactionContextMessageUsageResolve(message: CompactionMessage): CompactionTokenUsage | undefined {
  if (message.role !== "assistant") return undefined
  return compactionTokenUsageResolve(message.reportedUsage ?? message.metadata)
}

function compactionContextMessageEstimate(message: CompactionMessage) {
  const { reportedUsage: _reportedUsage, ...withoutReportedUsage } = message
  return compactionTokenEstimate(withoutReportedUsage)
}

function compactionContextTrailingEstimateResolve(
  messages: readonly CompactionMessage[],
  usageIndex: number,
): number | undefined {
  let trailing = 0
  for (let index = usageIndex + 1; index < messages.length; index += 1) {
    const estimated = compactionContextMessageEstimate(messages[index] as CompactionMessage)
    if (!estimated.success) return undefined
    trailing += estimated.data
    if (!Number.isSafeInteger(trailing)) return undefined
  }
  return trailing
}

export function compactionContextUsageResolve(input: {
  messages: readonly CompactionMessage[]
  reportedUsage?: CompactionTokenUsage
  reportedUsageMessageIndex?: number
}): CompactionContextUsageResolution {
  const directUsage = compactionTokenUsageResolve(input.reportedUsage)
  if (directUsage !== undefined) {
    if (input.reportedUsageMessageIndex === undefined) return { reportedUsage: directUsage }
    if (
      !Number.isSafeInteger(input.reportedUsageMessageIndex) ||
      input.reportedUsageMessageIndex < -1 ||
      input.reportedUsageMessageIndex >= input.messages.length
    )
      return {}
    const estimatedTrailingInputTokens = compactionContextTrailingEstimateResolve(
      input.messages,
      input.reportedUsageMessageIndex,
    )
    return estimatedTrailingInputTokens === undefined
      ? {}
      : { estimatedTrailingInputTokens, reportedUsage: directUsage }
  }

  let staleUsageBoundary = false
  for (let index = input.messages.length - 1; index >= 0; index -= 1) {
    const message = input.messages[index]
    if (message?.id === "compaction-summary" && message.role === "system") staleUsageBoundary = true
    if (staleUsageBoundary) continue
    const reportedUsage = message === undefined ? undefined : compactionContextMessageUsageResolve(message)
    if (reportedUsage === undefined) continue
    const estimatedTrailingInputTokens = compactionContextTrailingEstimateResolve(input.messages, index)
    if (estimatedTrailingInputTokens === undefined) return {}
    return { estimatedTrailingInputTokens, reportedUsage }
  }
  return {}
}

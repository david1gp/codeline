import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { CompactionPressureDecision } from "./compactionPressureDecision.js"
import type { CompactionTokenUsage } from "./compactionTokenUsage.js"
import { compactionTokenUsageResolve } from "./compactionTokenUsageResolve.js"

export function compactionPressureResolve(input: {
  contextLimitTokens: number
  estimatedInputTokens: number
  estimatedTrailingInputTokens?: number
  pressureThreshold: number
  reserveOutputTokens: number
  reportedUsage?: CompactionTokenUsage
}): Result<CompactionPressureDecision> {
  const op = "compactionPressureResolve"
  if (!Number.isSafeInteger(input.contextLimitTokens) || input.contextLimitTokens < 1) {
    return createResultError(op, "contextLimitTokens must be a positive integer.")
  }
  if (!Number.isSafeInteger(input.reserveOutputTokens) || input.reserveOutputTokens < 0) {
    return createResultError(op, "reserveOutputTokens must be a non-negative integer.")
  }
  if (input.reserveOutputTokens >= input.contextLimitTokens) {
    return createResultError(op, "reserveOutputTokens must be smaller than contextLimitTokens.")
  }
  if (!Number.isFinite(input.pressureThreshold) || input.pressureThreshold <= 0 || input.pressureThreshold > 1) {
    return createResultError(op, "pressureThreshold must be greater than 0 and at most 1.")
  }
  if (!Number.isSafeInteger(input.estimatedInputTokens) || input.estimatedInputTokens < 0) {
    return createResultError(op, "estimatedInputTokens must be a non-negative integer.")
  }
  if (
    input.estimatedTrailingInputTokens !== undefined &&
    (!Number.isSafeInteger(input.estimatedTrailingInputTokens) || input.estimatedTrailingInputTokens < 0)
  ) {
    return createResultError(op, "estimatedTrailingInputTokens must be a non-negative integer.")
  }
  const reportedUsage = compactionTokenUsageResolve(input.reportedUsage)
  const reportedInputTokens = reportedUsage?.inputTokens ?? reportedUsage?.totalTokens
  const inputTokens =
    reportedInputTokens === undefined
      ? input.estimatedInputTokens
      : reportedInputTokens + (input.estimatedTrailingInputTokens ?? 0)
  if (!Number.isSafeInteger(inputTokens)) return createResultError(op, "Token usage exceeds safe integer bounds.")
  const availableInputTokens = input.contextLimitTokens - input.reserveOutputTokens
  const pressureRatio = inputTokens / availableInputTokens
  return createResult({
    availableInputTokens,
    inputTokens,
    pressureRatio,
    shouldCompact: pressureRatio >= input.pressureThreshold || inputTokens >= availableInputTokens,
  })
}

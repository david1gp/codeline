import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { CompactionPressureDecision } from "./compactionPressureDecision.js"
import type { CompactionTokenUsage } from "./compactionTokenUsage.js"

export function compactionPressureResolve(input: {
  contextLimitTokens: number
  estimatedInputTokens: number
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
  const reportedInputTokens = input.reportedUsage?.inputTokens ?? input.reportedUsage?.totalTokens
  if (reportedInputTokens !== undefined && (!Number.isSafeInteger(reportedInputTokens) || reportedInputTokens < 0)) {
    return createResultError(op, "Reported token usage must contain non-negative integers.")
  }
  const inputTokens = reportedInputTokens ?? input.estimatedInputTokens
  const availableInputTokens = input.contextLimitTokens - input.reserveOutputTokens
  const pressureRatio = inputTokens / availableInputTokens
  return createResult({
    availableInputTokens,
    inputTokens,
    pressureRatio,
    shouldCompact: pressureRatio >= input.pressureThreshold || inputTokens >= availableInputTokens,
  })
}

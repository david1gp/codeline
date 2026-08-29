import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { CompactionPolicy } from "./compactionPolicy.js"
import { compactionPolicyDefaults } from "./compactionPolicyDefaults.js"

function compactionPolicyPositiveInteger(value: number, name: string): string | undefined {
  if (!Number.isSafeInteger(value) || value < 1) return `${name} must be a positive integer.`
  return undefined
}

export function compactionPolicyResolve(overrides: Partial<CompactionPolicy> = {}): Result<CompactionPolicy> {
  const op = "compactionPolicyResolve"
  const policy = { ...compactionPolicyDefaults, ...overrides }
  const integerFields: Array<[number, string]> = [
    [policy.contextLimitTokens, "contextLimitTokens"],
    [policy.maxSummaryChars, "maxSummaryChars"],
    [policy.maxToolOutputChars, "maxToolOutputChars"],
    [policy.recentTokenBudget, "recentTokenBudget"],
    [policy.reserveOutputTokens, "reserveOutputTokens"],
  ]
  for (const [value, name] of integerFields) {
    const error = compactionPolicyPositiveInteger(value, name)
    if (error !== undefined) return createResultError(op, error)
  }
  if (!Number.isFinite(policy.pressureThreshold) || policy.pressureThreshold <= 0 || policy.pressureThreshold > 1) {
    return createResultError(op, "pressureThreshold must be greater than 0 and at most 1.")
  }
  if (policy.reserveOutputTokens >= policy.contextLimitTokens) {
    return createResultError(op, "reserveOutputTokens must be smaller than contextLimitTokens.")
  }
  if (policy.recentTokenBudget >= policy.contextLimitTokens - policy.reserveOutputTokens) {
    return createResultError(op, "recentTokenBudget must leave room for a compacted prefix.")
  }
  return createResult(policy)
}

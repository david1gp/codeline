import { type Result } from "@adaptive-ds/result"
import { compactionConfigurationDefaults } from "./compactionConfigurationDefaults.js"
import type { CompactionConfiguration } from "./compactionConfigurationSchema.js"
import type { CompactionPolicy } from "./compactionPolicy.js"
import { compactionPolicyDefaults } from "./compactionPolicyDefaults.js"
import { compactionPolicyResolve } from "./compactionPolicyResolve.js"

export function compactionPolicyFromConfiguration(
  configuration: Partial<CompactionConfiguration> = {},
  contextLimitTokens = compactionPolicyDefaults.contextLimitTokens,
): Result<CompactionPolicy> {
  const maxSummaryChars = Math.min(
    Number.MAX_SAFE_INTEGER,
    (configuration.maxSummaryTokens ?? compactionConfigurationDefaults.maxSummaryTokens) * 4,
  )
  return compactionPolicyResolve({
    contextLimitTokens,
    maxSummaryChars,
    maxToolOutputChars: compactionPolicyDefaults.maxToolOutputChars,
    pressureThreshold: configuration.pressureThreshold ?? compactionPolicyDefaults.pressureThreshold,
    recentTokenBudget: configuration.recentTokenBudget ?? compactionPolicyDefaults.recentTokenBudget,
    reserveOutputTokens: configuration.reserveOutputTokens ?? compactionPolicyDefaults.reserveOutputTokens,
  })
}

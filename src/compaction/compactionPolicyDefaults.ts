import type { CompactionPolicy } from "./compactionPolicy.js"

export const compactionPolicyDefaults: CompactionPolicy = {
  contextLimitTokens: 128_000,
  maxSummaryChars: 16_000,
  maxToolOutputChars: 12_000,
  pressureThreshold: 0.8,
  recentTokenBudget: 12_000,
  reserveOutputTokens: 8_192,
}

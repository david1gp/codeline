export type CompactionPolicy = {
  contextLimitTokens: number
  maxSummaryChars: number
  maxToolOutputChars: number
  pressureThreshold: number
  recentTokenBudget: number
  reserveOutputTokens: number
}

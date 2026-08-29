export type CompactionPressureDecision = {
  availableInputTokens: number
  inputTokens: number
  pressureRatio: number
  shouldCompact: boolean
}

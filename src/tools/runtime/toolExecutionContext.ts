export type ToolExecutionContext = {
  outputLimit?: number
  signal: AbortSignal
  timeoutMs?: number | null
  toolCallId: string
}

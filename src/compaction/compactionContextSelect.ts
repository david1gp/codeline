import { createResult, type Result } from "@adaptive-ds/result"
import { compactionBoundarySelect } from "./compactionBoundarySelect.js"
import type { CompactionContextSelection } from "./compactionContextSelection.js"
import type { CompactionMessage } from "./compactionMessage.js"

export function compactionContextSelect(input: {
  messages: readonly CompactionMessage[]
  recentTokenBudget: number
  summary?: string
}): Result<CompactionContextSelection> {
  const boundary = compactionBoundarySelect(input)
  if (!boundary.success) return boundary
  const summary = input.summary?.trim()
  const context =
    summary === undefined || summary.length === 0
      ? boundary.data.retained
      : [{ content: summary, id: "compaction-summary", role: "system" as const }, ...boundary.data.retained]
  return createResult({
    compacted: boundary.data.compacted,
    context,
    cutIndex: boundary.data.cutIndex,
    retained: boundary.data.retained,
  })
}

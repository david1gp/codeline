import { createResult, type Result } from "@adaptive-ds/result"
import type { CompactionMessage } from "./compactionMessage.js"

const DEFAULT_RECENT_TOOL_BUDGET = 6
const DEFAULT_TRUNCATE_LIMIT = 2_000

type CompactionToolOutputPruneOptions = {
  /** How many recent tool outputs to keep in full. Older ones are truncated. */
  recentToolBudget?: number
  /** Truncated length for older tool outputs, in characters. */
  truncateLimit?: number
}

function compactionToolOutputTextTruncate(content: unknown, limit: number): string {
  const text = typeof content === "string" ? content : (JSON.stringify(content) ?? "")
  if (text.length <= limit) return text
  return `${text.slice(0, limit)}\n…[pruned ${text.length - limit} chars: old tool output retained as summary]`
}

/**
 * Cheap pre-compaction pruning: keep recent tool outputs in full, truncate
 * older bulky ones while preserving tool-call linkage (ids/roles stay
 * intact). This runs before token-heavy summarization so tool-heavy runs
 * spend fewer tokens and compact less often.
 */
export function compactionToolOutputPrune(
  messages: ReadonlyArray<CompactionMessage>,
  options: CompactionToolOutputPruneOptions = {},
): Result<Array<CompactionMessage>> {
  const op = "compactionToolOutputPrune"
  const recentToolBudget = options.recentToolBudget ?? DEFAULT_RECENT_TOOL_BUDGET
  const truncateLimit = options.truncateLimit ?? DEFAULT_TRUNCATE_LIMIT
  if (!Number.isSafeInteger(recentToolBudget) || recentToolBudget < 0)
    return { errorMessage: "recentToolBudget must be a non-negative integer.", op, success: false }
  if (!Number.isSafeInteger(truncateLimit) || truncateLimit < 0)
    return { errorMessage: "truncateLimit must be a non-negative integer.", op, success: false }

  const toolIndexes: Array<number> = []
  for (let index = 0; index < messages.length; index += 1) {
    if (messages[index]?.role === "tool") toolIndexes.push(index)
  }
  const keepFull = new Set(toolIndexes.slice(Math.max(0, toolIndexes.length - recentToolBudget)))
  const pruned: Array<CompactionMessage> = messages.map((message, index) => {
    if (message.role !== "tool" || keepFull.has(index)) return message
    return {
      ...message,
      content: compactionToolOutputTextTruncate(message.content, truncateLimit),
    }
  })
  return createResult(pruned)
}

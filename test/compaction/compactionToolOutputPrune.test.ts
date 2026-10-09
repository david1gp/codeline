import { describe, expect, test } from "bun:test"
import { compactionToolOutputPrune } from "../../src/compaction/compactionToolOutputPrune.js"
import type { CompactionMessage } from "../../src/compaction/compactionMessage.js"

const toolMessage = (content: string, sequence = 1): CompactionMessage => ({ content, role: "tool", sequence })

describe("compactionToolOutputPrune", () => {
  test("keeps recent tool outputs in full and truncates older ones", () => {
    const messages: Array<CompactionMessage> = [
      { content: "hello", role: "user", sequence: 1 },
      toolMessage("old-output".repeat(1000), 2),
      toolMessage("recent-output", 3),
    ]
    const pruned = compactionToolOutputPrune(messages, { recentToolBudget: 1, truncateLimit: 50 })
    expect(pruned.success).toBe(true)
    if (!pruned.success) return
    expect(pruned.data[1]?.content).toContain("[pruned")
    expect(pruned.data[2]).toEqual(messages[2])
    // Linkage is preserved: role and order are untouched.
    expect(pruned.data.map((message) => message.role)).toEqual(["user", "tool", "tool"])
  })

  test("rejects negative budgets", () => {
    const result = compactionToolOutputPrune([], { recentToolBudget: -1 })
    expect(result.success).toBe(false)
  })
})

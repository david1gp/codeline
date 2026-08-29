import { expect, test } from "bun:test"
import { compactionBoundarySelect } from "../src/compaction/compactionBoundarySelect.js"
import type { CompactionMessage } from "../src/compaction/compactionMessage.js"
import { compactionTokenEstimate } from "../src/compaction/compactionTokenEstimate.js"

const messages: readonly CompactionMessage[] = [
  { content: "goal", id: "user-1", role: "user" },
  { content: "call", id: "assistant-1", role: "assistant", toolCalls: [{ id: "call-1", name: "read" }] },
  { content: "result", id: "tool-1", role: "tool", toolCallId: "call-1" },
  { content: "continuing", id: "assistant-2", role: "assistant" },
]

test("moves a requested boundary before an assistant tool lifecycle", () => {
  const resultEstimate = compactionTokenEstimate(messages[2])
  if (!resultEstimate.success) throw new Error(resultEstimate.errorMessage)
  const result = compactionBoundarySelect({ messages, recentTokenBudget: resultEstimate.data + 1 })

  expect(result).toMatchObject({ success: true, data: { cutIndex: 1 } })
  if (result.success) {
    expect(result.data.compacted.map(({ id }) => id)).toEqual(["user-1"])
    expect(result.data.retained.map(({ id }) => id)).toEqual(["assistant-1", "tool-1", "assistant-2"])
  }
})

test("retains an incomplete lifecycle instead of cutting through it", () => {
  const incomplete = messages.slice(0, 2)
  const result = compactionBoundarySelect({ messages: incomplete, recentTokenBudget: 0 })

  expect(result).toMatchObject({ success: true, data: { cutIndex: 1 } })
})

test("recognizes tool calls in structured assistant content", () => {
  const structuredMessages: readonly CompactionMessage[] = [
    { content: "before", role: "user" },
    { content: [{ id: "call-2", type: "tool-call" }], role: "assistant" },
    { content: "output", role: "tool", toolCallId: "call-2" },
    { content: "after", role: "user" },
  ]
  const result = compactionBoundarySelect({ messages: structuredMessages, recentTokenBudget: 12 })

  expect(result).toMatchObject({ success: true, data: { cutIndex: 1 } })
})

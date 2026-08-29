import { expect, test } from "bun:test"
import { compactionContextUsageResolve } from "../src/compaction/compactionContextUsageResolve.js"
import type { CompactionMessage } from "../src/compaction/compactionMessage.js"
import { compactionTokenEstimate } from "../src/compaction/compactionTokenEstimate.js"

test("retains the latest valid completed usage and estimates only its trailing messages", () => {
  const messages: CompactionMessage[] = [
    { content: "old request", role: "user" },
    { content: "old response", reportedUsage: { inputTokens: 1_000, totalTokens: 1_020 }, role: "assistant" },
    { content: "new request", role: "user" },
  ]
  const trailing = compactionTokenEstimate(messages[2])
  expect(trailing.success).toBe(true)
  if (!trailing.success) return

  expect(compactionContextUsageResolve({ messages })).toEqual({
    estimatedTrailingInputTokens: trailing.data,
    reportedUsage: { inputTokens: 1_000, totalTokens: 1_020 },
  })
})

test("rejects stale usage before a compaction summary and falls back to the estimate", () => {
  const messages: CompactionMessage[] = [
    { content: "old response", reportedUsage: { inputTokens: 10_000 }, role: "assistant" },
    { content: "summary", id: "compaction-summary", role: "system" },
    { content: "new request", role: "user" },
  ]

  expect(compactionContextUsageResolve({ messages })).toEqual({})
})

test("skips zero, error, and aborted usage while retaining the prior valid response", () => {
  const messages: CompactionMessage[] = [
    { content: "valid response", reportedUsage: { inputTokens: 1_000 }, role: "assistant" },
    { content: "zero response", metadata: { __codeline_reported_usage: { inputTokens: 0 } }, role: "assistant" },
    {
      content: "error response",
      metadata: { __codeline_reported_usage: { inputTokens: 2_000, status: "error" } },
      role: "assistant",
    },
    {
      content: "aborted response",
      metadata: { __codeline_reported_usage: { inputTokens: 3_000, status: "aborted" } },
      role: "assistant",
    },
  ]

  expect(compactionContextUsageResolve({ messages })).toMatchObject({
    reportedUsage: { inputTokens: 1_000 },
  })
})

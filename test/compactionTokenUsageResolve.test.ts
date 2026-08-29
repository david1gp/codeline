import { expect, test } from "bun:test"
import { compactionTokenUsageResolve } from "../src/compaction/compactionTokenUsageResolve.js"

test("normalizes TanStack and OpenAI-compatible usage fields", () => {
  expect(compactionTokenUsageResolve({ promptTokens: 100, completionTokens: 20, totalTokens: 120 })).toEqual({
    inputTokens: 100,
    outputTokens: 20,
    totalTokens: 120,
  })
  expect(compactionTokenUsageResolve({ prompt_tokens: 200, completion_tokens: 30, total_tokens: 230 })).toEqual({
    inputTokens: 200,
    outputTokens: 30,
    totalTokens: 230,
  })
  expect(compactionTokenUsageResolve({ response: { usage: { input_tokens: 300, output_tokens: 40 } } })).toEqual({
    inputTokens: 300,
    outputTokens: 40,
  })
})

test("accepts only successful completed usage with positive context tokens", () => {
  expect(
    compactionTokenUsageResolve({
      outcome: { type: "success" },
      type: "RUN_FINISHED",
      usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
    }),
  ).toEqual({ inputTokens: 100, outputTokens: 20, totalTokens: 120 })
  for (const input of [
    { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    { outcome: { type: "interrupt" }, type: "RUN_FINISHED", usage: { promptTokens: 100 } },
    { code: "provider_failed", type: "RUN_ERROR", usage: { promptTokens: 100 } },
    { promptTokens: 100, completionTokens: Number.NaN },
  ]) {
    expect(compactionTokenUsageResolve(input)).toBeUndefined()
  }
})

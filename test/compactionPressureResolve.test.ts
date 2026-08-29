import { expect, test } from "bun:test"
import { compactionPressureResolve } from "../src/compaction/compactionPressureResolve.js"

const pressureInput = {
  contextLimitTokens: 10_000,
  estimatedInputTokens: 1_000,
  pressureThreshold: 0.8,
  reserveOutputTokens: 2_000,
}

test("prefers reported input usage over the conservative estimate", () => {
  const result = compactionPressureResolve({
    ...pressureInput,
    reportedUsage: { inputTokens: 6_500, outputTokens: 20 },
  })

  expect(result).toMatchObject({ success: true, data: { inputTokens: 6_500, shouldCompact: true } })
})

test("uses estimation when reported input usage is unavailable", () => {
  const result = compactionPressureResolve({ ...pressureInput, estimatedInputTokens: 6_400 })

  expect(result).toMatchObject({ success: true, data: { inputTokens: 6_400, shouldCompact: true } })
})

test("rejects invalid context accounting", () => {
  const result = compactionPressureResolve({ ...pressureInput, reserveOutputTokens: 10_000 })

  expect(result).toMatchObject({ success: false, op: "compactionPressureResolve" })
})

import { expect, test } from "bun:test"
import { compactionTokenEstimate } from "../src/compaction/compactionTokenEstimate.js"

test("estimates UTF-8 input conservatively and deterministically", () => {
  const first = compactionTokenEstimate("hello 👋")
  const second = compactionTokenEstimate("hello 👋")

  expect(first).toEqual(second)
  expect(first).toMatchObject({ success: true })
  if (first.success) expect(first.data).toBeGreaterThan(0)
})

test("returns a Result error for circular values", () => {
  const value: Record<string, unknown> = {}
  value.self = value

  expect(compactionTokenEstimate(value)).toMatchObject({
    errorMessage: "The value cannot be estimated safely.",
    success: false,
  })
})

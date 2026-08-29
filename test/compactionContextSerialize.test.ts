import { expect, test } from "bun:test"
import { compactionContextSerialize } from "../src/compaction/compactionContextSerialize.js"

test("serializes keys in stable order and bounds tool output", () => {
  const result = compactionContextSerialize(
    [
      { content: { z: 1, a: 2 }, id: "user-1", role: "user" },
      { content: "output ".repeat(100), id: "tool-1", role: "tool", toolCallId: "call-1" },
    ],
    { maxToolOutputChars: 80 },
  )

  expect(result).toMatchObject({ success: true })
  if (result.success) {
    expect(result.data).toContain('"role":"user"')
    expect(result.data).toContain('"role":"tool"')
    expect(result.data).toContain("truncated")
    expect(result.data.indexOf('"a":2')).toBeLessThan(result.data.indexOf('"z":1'))
  }
})

test("returns a Result error for circular context", () => {
  const content: Record<string, unknown> = {}
  content.self = content

  expect(compactionContextSerialize([{ content, role: "user" }])).toMatchObject({
    errorMessage: "The context contains a value that cannot be serialized safely.",
    success: false,
  })
})

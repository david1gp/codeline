import { expect, test } from "bun:test"
import { executionStreamEventNormalize } from "../src/stream/actions/executionStreamEventNormalize.js"
import { executionToolPayloadBound } from "../src/stream/actions/executionToolPayloadBound.js"

const encoder = new TextEncoder()

function parseBoundContent<T>(content: string): T {
  return JSON.parse(content) as T
}

test("keeps ordinary tool payloads unchanged and unmarked", () => {
  const bound = executionToolPayloadBound({ exitCode: 0, stdout: "ordinary output" })

  expect(bound).toEqual({
    content: JSON.stringify({ exitCode: 0, stdout: "ordinary output" }),
    truncated: false,
  })
})

test("retains a deterministic UTF-8 tail for oversized single text payloads", () => {
  const input = `discarded-prefix-${"x".repeat(20_000)}final-line`
  const first = executionToolPayloadBound(input)
  const second = executionToolPayloadBound(input)
  const retained = parseBoundContent<string>(first.content)

  expect(first).toEqual(second)
  expect(first.truncated).toBe(true)
  expect(retained.startsWith("[Earlier output truncated]\n\n")).toBe(true)
  expect(retained.endsWith("final-line")).toBe(true)
  expect(retained).not.toContain("discarded-prefix-")
  expect(encoder.encode(first.content).byteLength).toBeLessThanOrEqual(8_192)
})

test("does not split multibyte text while retaining its tail", () => {
  const input = `${"前置内容".repeat(3_000)}尾部😀終わり`
  const bound = executionToolPayloadBound(input)
  const retained = parseBoundContent<string>(bound.content)

  expect(bound.truncated).toBe(true)
  expect(retained.startsWith("[Earlier output truncated]\n\n")).toBe(true)
  expect(retained.endsWith("尾部😀終わり")).toBe(true)
  expect(retained).not.toContain("\ufffd")
  expect(encoder.encode(retained).byteLength).toBeLessThanOrEqual(8_000 + 32)
})

test("bounds nested raw output and result payloads with explicit metadata", () => {
  const oversized = `prefix-${"x".repeat(20_000)}-tail`
  const output = executionStreamEventNormalize({
    output: {
      raw: { content: oversized },
    },
    toolCallId: "call-nested-output",
    type: "tool_output",
  })
  const result = executionStreamEventNormalize({
    outcome: "error",
    result: { raw: { result: oversized } },
    toolCallId: "call-nested-result",
    type: "tool_result",
    workingDirectory: "/tmp/project",
  })

  expect(output.success).toBe(true)
  expect(result.success).toBe(true)
  if (!output.success || !result.success) return
  if (output.data.eventType !== "tool_output" || result.data.eventType !== "tool_result") return

  const boundedOutput = parseBoundContent<Record<string, unknown>>(output.data.payload.output)
  const boundedResult = parseBoundContent<Record<string, unknown>>(result.data.payload.result)
  const nestedOutput = boundedOutput.raw as { content: string }
  const nestedResult = (boundedResult.raw as { result: string }).result

  expect(output.data.payload.truncated).toBe(true)
  expect(result.data.payload.truncated).toBe(true)
  expect(nestedOutput.content.startsWith("[Earlier output truncated]\n\n")).toBe(true)
  expect(nestedOutput.content.endsWith("-tail")).toBe(true)
  expect(nestedResult.startsWith("[Earlier output truncated]\n\n")).toBe(true)
  expect(nestedResult.endsWith("-tail")).toBe(true)
  expect(result.data.payload.workingDirectory).toBe("/tmp/project")
  expect(encoder.encode(output.data.payload.output).byteLength).toBeLessThanOrEqual(8_192)
  expect(encoder.encode(result.data.payload.result).byteLength).toBeLessThanOrEqual(8_192)
})

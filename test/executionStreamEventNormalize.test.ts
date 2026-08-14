import { expect, test } from "bun:test"
import { EventType } from "@tanstack/ai"
import * as v from "valibot"
import { providerExecutionEventFromStreamChunk } from "../src/providers/runtime/providerExecutionEventFromStreamChunk.js"
import { providerRuntimeAdapterCreate } from "../src/providers/runtime/providerRuntimeAdapterCreate.js"
import { executionStreamEventNormalize } from "../src/stream/actions/executionStreamEventNormalize.js"
import { executionStreamEventSchema } from "../src/stream/schema/executionStreamEventSchema.js"

test("normalizes the current plain-text provider stream without changing it", async () => {
  const adapter = providerRuntimeAdapterCreate({
    chunks: ["plain text"],
    configuration: { model: "test-model", provider: "deterministic" },
    environment: {},
  })
  const originalTypes: string[] = []
  const durableEvents = []

  for await (const chunk of adapter({
    history: [],
    prompt: "prompt",
    runId: "run",
    sessionId: "session",
    signal: new AbortController().signal,
  })) {
    originalTypes.push(chunk.type)
    const providerEvent = providerExecutionEventFromStreamChunk(chunk)
    expect(providerEvent.success).toBe(true)
    if (!providerEvent.success || providerEvent.data === null) continue
    const durable = executionStreamEventNormalize(providerEvent.data)
    expect(durable.success).toBe(true)
    if (durable.success) durableEvents.push(durable.data)
  }

  expect(originalTypes).toEqual([
    EventType.RUN_STARTED,
    EventType.TEXT_MESSAGE_START,
    EventType.TEXT_MESSAGE_CONTENT,
    EventType.TEXT_MESSAGE_END,
    EventType.RUN_FINISHED,
  ])
  expect(durableEvents).toEqual([
    { eventType: "text_delta", payload: { delta: "plain text" } },
    { eventType: "terminal", payload: { status: "completed" } },
  ])
})

test("maps thinking, tool, written-file, and terminal provider events to strict durable contracts", () => {
  const inputs = [
    { status: "started", type: "thinking_status" },
    { toolCallId: "call-1", toolName: "read", type: "tool_start" },
    { output: "line one", toolCallId: "call-1", type: "tool_output" },
    { outcome: "success", result: { count: 1 }, toolCallId: "call-1", type: "tool_result" },
    { path: "src/file.ts", type: "written_file" },
    { status: "aborted", type: "terminal" },
  ]

  const events = inputs.map((input) => {
    const provider = providerExecutionEventFromStreamChunk(input)
    expect(provider.success).toBe(true)
    if (!provider.success || provider.data === null) throw new Error("Expected provider event")
    const durable = executionStreamEventNormalize(provider.data)
    expect(durable.success).toBe(true)
    if (!durable.success) throw new Error(durable.errorMessage)
    expect(v.safeParse(executionStreamEventSchema, durable.data).success).toBe(true)
    return durable.data
  })

  expect(events.map((event) => event.eventType)).toEqual([
    "thinking_status",
    "tool_start",
    "tool_output",
    "tool_result",
    "written_file",
    "terminal",
  ])
})

test("redacts secrets and bounds nested tool payloads", () => {
  const values = Array.from({ length: 60 }, (_, index) => `value-${index}`)
  const normalized = executionStreamEventNormalize({
    output: {
      apiKey: "sk-secretvalue123",
      authorization: "Bearer secret-token-value",
      nested: { password: "do-not-store", values },
      url: "https://user:password@example.test/path",
    },
    toolCallId: "call-secret",
    type: "tool_output",
  })

  expect(normalized.success).toBe(true)
  if (!normalized.success || normalized.data.eventType !== "tool_output") return
  expect(normalized.data.payload.truncated).toBe(true)
  expect(normalized.data.payload.output.length).toBeLessThanOrEqual(16_384)
  expect(normalized.data.payload.output).toContain("[REDACTED]")
  expect(normalized.data.payload.output).not.toContain("secretvalue123")
  expect(normalized.data.payload.output).not.toContain("secret-token-value")
  expect(normalized.data.payload.output).not.toContain("do-not-store")
  expect(normalized.data.payload.output).not.toContain("user:password@")
})

test("rejects malformed provider events and unsafe written-file paths", () => {
  expect(providerExecutionEventFromStreamChunk({ delta: "text", extra: true, type: "text_delta" }).success).toBe(false)
  expect(executionStreamEventNormalize({ path: "../secret", type: "written_file" }).success).toBe(false)
  expect(executionStreamEventNormalize({ path: "/host/private", type: "written_file" }).success).toBe(false)
})

test("maps TanStack tool and error chunks without retaining provider-only fields", () => {
  const tool = providerExecutionEventFromStreamChunk({
    metadata: { apiKey: "must-not-pass" },
    timestamp: Date.now(),
    toolCallId: "call-2",
    toolCallName: "shell",
    toolName: "shell",
    type: EventType.TOOL_CALL_START,
  })
  expect(tool).toMatchObject({
    data: { toolCallId: "call-2", toolName: "shell", type: "tool_start" },
    success: true,
  })

  const terminal = providerExecutionEventFromStreamChunk({
    code: "provider_error",
    message: "Bearer provider-secret",
    type: EventType.RUN_ERROR,
  })
  expect(terminal.success).toBe(true)
  if (!terminal.success || terminal.data === null) return
  const durable = executionStreamEventNormalize(terminal.data)
  expect(durable).toMatchObject({
    data: {
      eventType: "terminal",
      payload: { code: "provider_error", message: "Bearer [REDACTED]", status: "error" },
    },
    success: true,
  })
})

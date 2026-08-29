import { expect, test } from "bun:test"
import { EventType, type StreamChunk } from "@tanstack/ai"
import type { CliProxyApiAdapter, CliProxyApiAdapterInput } from "../src/providers/runtime/cliProxyApiAdapterCreate.js"
import { providerDelegationAdapterCreate } from "../src/providers/runtime/providerDelegationAdapterCreate.js"

function completedStream(): Array<StreamChunk> {
  return [
    { runId: "run", threadId: "session", timestamp: 1, type: EventType.RUN_STARTED },
    { delta: "done", messageId: "message", timestamp: 2, type: EventType.TEXT_MESSAGE_CONTENT },
    {
      finishReason: "stop",
      outcome: { type: "success" },
      runId: "run",
      threadId: "session",
      timestamp: 3,
      type: EventType.RUN_FINISHED,
    },
  ] as Array<StreamChunk>
}

async function consume(stream: AsyncIterable<StreamChunk>): Promise<void> {
  for await (const _chunk of stream) {
    // Consume the response stream.
  }
}

test("delegation resolver keeps the prepared durable user once and marks the resolved prompt as included", async () => {
  const calls: Array<CliProxyApiAdapterInput> = []
  const adapter = ((input: CliProxyApiAdapterInput) => {
    calls.push(input)
    return (async function* () {
      for (const chunk of completedStream()) yield chunk
    })()
  }) as CliProxyApiAdapter
  const delegated = providerDelegationAdapterCreate({ adapter, model: "delegation-model" })

  await consume(
    delegated({
      history: [
        { content: "older", id: "message-1", role: "user", sequence: 1 },
        { content: "durable current", id: "message-2", role: "user", sequence: 2 },
        { content: "durable current", id: "message-2", role: "user", sequence: 2 },
        { content: "tool result", role: "tool", toolCallId: "call-1" },
      ] as never,
      preparedUserMessage: { id: "message-2", sequence: 2 },
      prompt: "submitted prompt",
      runId: "run-prepared",
      sessionId: "session-prepared",
      signal: new AbortController().signal,
    }),
  )

  expect(calls).toHaveLength(1)
  expect(calls[0]?.history).toEqual([
    { content: "older", role: "user" },
    { content: "durable current", role: "user" },
    { content: "tool result", role: "tool", toolCallId: "call-1" },
  ])
  expect(calls[0]?.currentUserMessageIncluded).toBe(true)
})

test("delegation resolver appends a non-durable prompt once after durable history", async () => {
  const calls: Array<CliProxyApiAdapterInput> = []
  const adapter = ((input: CliProxyApiAdapterInput) => {
    calls.push(input)
    return (async function* () {
      for (const chunk of completedStream()) yield chunk
    })()
  }) as CliProxyApiAdapter
  const delegated = providerDelegationAdapterCreate({ adapter, model: "delegation-model" })

  await consume(
    delegated({
      history: [
        { content: "older", id: "message-1", role: "user", sequence: 1 },
        { content: "answer", role: "assistant" },
      ] as never,
      prompt: "new prompt",
      runId: "run-explicit",
      sessionId: "session-explicit",
      signal: new AbortController().signal,
    }),
  )

  expect(calls[0]?.history).toEqual([
    { content: "older", role: "user" },
    { content: "answer", role: "assistant" },
    { content: "new prompt", role: "user" },
  ])
  expect(calls[0]?.currentUserMessageIncluded).toBe(true)
})

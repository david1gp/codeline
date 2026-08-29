import { expect, test } from "bun:test"
import { type AnyTextAdapter, EventType, type ModelMessage, type StreamChunk } from "@tanstack/ai"
import type { CompactionPolicy } from "../src/compaction/compactionPolicy.js"
import { providerDelegationCompactionAdapterCreate } from "../src/providers/runtime/providerDelegationCompactionAdapterCreate.js"

type Deferred = {
  promise: Promise<void>
  resolve: () => void
}

type ProviderCall = {
  messages: Array<ModelMessage>
  runId: string | undefined
}

type AdapterInput = Parameters<AnyTextAdapter["chatStream"]>[0]

function deferredCreate(): Deferred {
  let resolvePromise: () => void = () => undefined
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve
  })
  return { promise, resolve: resolvePromise }
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<Array<StreamChunk>> {
  const chunks: Array<StreamChunk> = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

function finalTextScript(text: string, runId: string): Array<StreamChunk> {
  return [
    { runId, threadId: `thread-${runId}`, timestamp: 1, type: EventType.RUN_STARTED },
    { messageId: `message-${runId}`, role: "assistant", timestamp: 2, type: EventType.TEXT_MESSAGE_START },
    { delta: text, messageId: `message-${runId}`, timestamp: 3, type: EventType.TEXT_MESSAGE_CONTENT },
    { messageId: `message-${runId}`, timestamp: 4, type: EventType.TEXT_MESSAGE_END },
    {
      finishReason: "stop",
      outcome: { type: "success" },
      runId,
      threadId: `thread-${runId}`,
      timestamp: 5,
      type: EventType.RUN_FINISHED,
    },
  ] as Array<StreamChunk>
}

function summaryScript(text: string): Array<StreamChunk> {
  return [
    { timestamp: 1, type: EventType.RUN_STARTED },
    { messageId: "summary-message", role: "assistant", timestamp: 2, type: EventType.TEXT_MESSAGE_START },
    { delta: text, messageId: "summary-message", timestamp: 3, type: EventType.TEXT_MESSAGE_CONTENT },
    { messageId: "summary-message", timestamp: 4, type: EventType.TEXT_MESSAGE_END },
    { finishReason: "stop", outcome: { type: "success" }, timestamp: 5, type: EventType.RUN_FINISHED },
  ] as Array<StreamChunk>
}

function overflowScript(runId: string): Array<StreamChunk> {
  return [
    { runId, threadId: `thread-${runId}`, timestamp: 1, type: EventType.RUN_STARTED },
    { code: "provider_context_overflow", message: "too large", timestamp: 2, type: EventType.RUN_ERROR },
  ] as Array<StreamChunk>
}

function compactionPolicyCreate(overrides: Partial<CompactionPolicy> = {}): CompactionPolicy {
  return {
    contextLimitTokens: 1_000,
    maxSummaryChars: 1_000,
    maxToolOutputChars: 100,
    pressureThreshold: 0.01,
    recentTokenBudget: 80,
    reserveOutputTokens: 100,
    ...overrides,
  }
}

function chatMessages(label: string): Array<ModelMessage> {
  return Array.from({ length: 6 }, (_, index) => ({
    content: `${label} old context ${index} ${"x".repeat(400)}`,
    role: "user" as const,
  }))
}

function toolRoundMessages(messages: Array<ModelMessage>, label: string): Array<ModelMessage> {
  return [
    ...messages,
    {
      content: `Running ${label}'s tool.`,
      role: "assistant" as const,
      toolCalls: [
        {
          function: { arguments: `{"task":"${label}"}`, name: "delegate_task" },
          id: `call-${label}`,
          type: "function",
        },
      ],
    },
    { content: `${label} tool result`, role: "tool" as const, toolCallId: `call-${label}` },
  ]
}

function summaryAdapterCreate(releases: { a: Deferred; b: Deferred }): {
  adapter: AnyTextAdapter
  calls: Array<Array<ModelMessage>>
} {
  const calls: Array<Array<ModelMessage>> = []
  const adapter = {
    chatStream: (input: { messages: Array<ModelMessage> }) => {
      calls.push(input.messages)
      const serialized = JSON.stringify(input.messages)
      const label = serialized.includes("CHAT_A") ? "A" : "B"
      return (async function* () {
        await releases[label === "A" ? "a" : "b"].promise
        yield* summaryScript(`Summary ${label}`)
      })()
    },
    kind: "text" as const,
    model: "summary-model",
    name: "summary",
    structuredOutput: async () => ({ data: {}, rawText: "{}" }),
  } as unknown as AnyTextAdapter
  return { adapter, calls }
}

function providerAdapterCreate(options: { overflow: boolean; calls: Array<ProviderCall> }): AnyTextAdapter {
  const rounds = new Map<string, number>()
  return {
    chatStream: (input: { messages: Array<ModelMessage>; runId?: string }) => {
      options.calls.push({ messages: input.messages, runId: input.runId })
      const runId = input.runId ?? "unknown"
      const round = rounds.get(runId) ?? 0
      rounds.set(runId, round + 1)
      return (async function* () {
        if (options.overflow && round === 0) yield* overflowScript(runId)
        else if (round === 0) {
          yield { runId, threadId: `thread-${runId}`, timestamp: 1, type: EventType.RUN_STARTED }
          yield {
            finishReason: "tool_calls",
            outcome: { type: "success" },
            runId,
            threadId: `thread-${runId}`,
            timestamp: 2,
            type: EventType.RUN_FINISHED,
          } as StreamChunk
        } else yield* finalTextScript(`Final ${runId}`, runId)
      })()
    },
    kind: "text" as const,
    model: "provider-model",
    name: "provider",
    structuredOutput: async () => ({ data: {}, rawText: "{}" }),
  } as unknown as AnyTextAdapter
}

function messagesContain(messages: Array<ModelMessage>, content: string): boolean {
  return messages.some((message) => message.content === content)
}

test("isolates overlapping summaries and preserves each chat projection across rounds", async () => {
  const releases = { a: deferredCreate(), b: deferredCreate() }
  const summary = summaryAdapterCreate(releases)
  const calls: Array<ProviderCall> = []
  const adapter = providerDelegationCompactionAdapterCreate({
    adapter: providerAdapterCreate({ calls, overflow: false }),
    policy: compactionPolicyCreate(),
    summaryAdapter: summary.adapter,
  })
  const messagesA = chatMessages("CHAT_A")
  const messagesB = chatMessages("CHAT_B")
  const inputA = {
    messages: messagesA,
    request: { signal: new AbortController().signal },
    runId: "run-a",
    threadId: "thread-a",
  } as AdapterInput
  const inputB = {
    messages: messagesB,
    request: { signal: new AbortController().signal },
    runId: "run-b",
    threadId: "thread-b",
  } as AdapterInput

  const firstA = collect(adapter.chatStream(inputA))
  const firstB = collect(adapter.chatStream(inputB))
  releases.b.resolve()
  releases.a.resolve()
  await Promise.all([firstA, firstB])

  await Promise.all([
    collect(
      adapter.chatStream({
        ...inputA,
        messages: toolRoundMessages(messagesA, "CHAT_A"),
      }),
    ),
    collect(
      adapter.chatStream({
        ...inputB,
        messages: toolRoundMessages(messagesB, "CHAT_B"),
      }),
    ),
  ])

  const secondA = calls.find(
    (call) => call.runId === "run-a" && call.messages.some((message) => message.role === "tool"),
  )
  const secondB = calls.find(
    (call) => call.runId === "run-b" && call.messages.some((message) => message.role === "tool"),
  )
  expect(secondA).toBeDefined()
  expect(secondB).toBeDefined()
  expect(messagesContain(secondA?.messages ?? [], "Summary A")).toBe(true)
  expect(messagesContain(secondA?.messages ?? [], "Summary B")).toBe(false)
  expect(messagesContain(secondB?.messages ?? [], "Summary B")).toBe(true)
  expect(messagesContain(secondB?.messages ?? [], "Summary A")).toBe(false)
})

test("isolates overlapping overflow recovery and retries each chat with its own summary", async () => {
  const releases = { a: deferredCreate(), b: deferredCreate() }
  const summary = summaryAdapterCreate(releases)
  const calls: Array<ProviderCall> = []
  const adapter = providerDelegationCompactionAdapterCreate({
    adapter: providerAdapterCreate({ calls, overflow: true }),
    maxOverflowRetries: 1,
    policy: compactionPolicyCreate({ contextLimitTokens: 100_000, pressureThreshold: 1 }),
    summaryAdapter: summary.adapter,
  })

  const firstA = collect(
    adapter.chatStream({ messages: chatMessages("CHAT_A"), runId: "run-a", threadId: "thread-a" } as AdapterInput),
  )
  const firstB = collect(
    adapter.chatStream({ messages: chatMessages("CHAT_B"), runId: "run-b", threadId: "thread-b" } as AdapterInput),
  )
  releases.b.resolve()
  releases.a.resolve()
  await Promise.all([firstA, firstB])

  expect(calls.filter(({ runId }) => runId === "run-a")).toHaveLength(2)
  expect(calls.filter(({ runId }) => runId === "run-b")).toHaveLength(2)
  const retryA = calls.filter((call) => call.runId === "run-a")[1]
  const retryB = calls.filter((call) => call.runId === "run-b")[1]
  expect(messagesContain(retryA?.messages ?? [], "Summary A")).toBe(true)
  expect(messagesContain(retryA?.messages ?? [], "Summary B")).toBe(false)
  expect(messagesContain(retryB?.messages ?? [], "Summary B")).toBe(true)
  expect(messagesContain(retryB?.messages ?? [], "Summary A")).toBe(false)
})

import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { type AnyTextAdapter, EventType, type ModelMessage, type StreamChunk } from "@tanstack/ai"
import type { CompactionPolicy } from "../src/compaction/compactionPolicy.js"
import { providerDelegationToolLoopCreate } from "../src/providers/runtime/providerDelegationToolLoopCreate.js"
import { providerExecutionEventFromStreamChunk } from "../src/providers/runtime/providerExecutionEventFromStreamChunk.js"
import { skillCatalogDiscover } from "../src/skills/actions/skillCatalogDiscover.js"
import { executionStreamEventNormalize } from "../src/stream/actions/executionStreamEventNormalize.js"
import { bashToolCreate } from "../src/tools/runtime/bashToolCreate.js"
import { delegateTaskToolCreate } from "../src/tools/runtime/delegateTaskToolCreate.js"
import { toolRegistryCreate } from "../src/tools/runtime/toolRegistryCreate.js"
import { webfetchToolCreate } from "../src/tools/runtime/webfetchToolCreate.js"

type ScriptedAdapter = {
  adapter: AnyTextAdapter
  calls: Array<Array<ModelMessage>>
  systemPrompts: Array<string | undefined>
  toolCounts: number[]
}

type SummaryScriptedAdapter = {
  adapter: AnyTextAdapter
  calls: Array<Array<ModelMessage>>
  toolCounts: number[]
}

function scriptedAdapterCreate(scripts: Array<Array<StreamChunk>>): ScriptedAdapter {
  const calls: Array<Array<ModelMessage>> = []
  const systemPrompts: Array<string | undefined> = []
  const toolCounts: number[] = []
  let scriptIndex = 0
  const adapter = {
    kind: "text" as const,
    model: "scripted-model",
    name: "scripted",
    chatStream: (options: { messages: Array<ModelMessage>; systemPrompts?: string[]; tools?: unknown[] }) => {
      calls.push(options.messages)
      systemPrompts.push(options.systemPrompts?.join("\n"))
      toolCounts.push(options.tools?.length ?? 0)
      const script = scripts[scriptIndex] ?? []
      scriptIndex += 1
      return (async function* () {
        for (const chunk of script) yield chunk
      })()
    },
    structuredOutput: async () => ({ data: {}, rawText: "{}" }),
  } as unknown as AnyTextAdapter
  return { adapter, calls, systemPrompts, toolCounts }
}

function summaryScriptedAdapterCreate(scripts: Array<Array<StreamChunk>>): SummaryScriptedAdapter {
  const calls: Array<Array<ModelMessage>> = []
  const toolCounts: number[] = []
  let scriptIndex = 0
  const adapter = {
    kind: "text" as const,
    model: "summary-model",
    name: "summary",
    chatStream: (options: { messages: Array<ModelMessage>; tools?: unknown[] }) => {
      calls.push(options.messages)
      toolCounts.push(options.tools?.length ?? 0)
      const script = scripts[scriptIndex] ?? []
      scriptIndex += 1
      return (async function* () {
        for (const chunk of script) yield chunk
      })()
    },
    structuredOutput: async () => ({ data: {}, rawText: "{}" }),
  } as unknown as AnyTextAdapter
  return { adapter, calls, toolCounts }
}

function delegatedToolScript(toolArguments: string): Array<StreamChunk> {
  return [
    { runId: "run-delegation", threadId: "thread-delegation", timestamp: 1, type: EventType.RUN_STARTED },
    {
      timestamp: 2,
      toolCallId: "call-delegation-1",
      toolCallName: "delegate_task",
      toolName: "delegate_task",
      type: EventType.TOOL_CALL_START,
    },
    { delta: toolArguments, timestamp: 3, toolCallId: "call-delegation-1", type: EventType.TOOL_CALL_ARGS },
    {
      finishReason: "tool_calls",
      outcome: { type: "success" },
      runId: "run-delegation",
      threadId: "thread-delegation",
      timestamp: 4,
      type: EventType.RUN_FINISHED,
    },
  ] as Array<StreamChunk>
}

function bashToolScript(toolArguments: string): Array<StreamChunk> {
  return [
    { runId: "run-delegation", threadId: "thread-delegation", timestamp: 1, type: EventType.RUN_STARTED },
    {
      timestamp: 2,
      toolCallId: "call-bash-1",
      toolCallName: "bash",
      toolName: "bash",
      type: EventType.TOOL_CALL_START,
    },
    { delta: toolArguments, timestamp: 3, toolCallId: "call-bash-1", type: EventType.TOOL_CALL_ARGS },
    {
      finishReason: "tool_calls",
      outcome: { type: "success" },
      runId: "run-delegation",
      threadId: "thread-delegation",
      timestamp: 4,
      type: EventType.RUN_FINISHED,
    },
  ] as Array<StreamChunk>
}

function webfetchToolScript(toolArguments: string): Array<StreamChunk> {
  return [
    { runId: "run-delegation", threadId: "thread-delegation", timestamp: 1, type: EventType.RUN_STARTED },
    {
      timestamp: 2,
      toolCallId: "call-webfetch-1",
      toolCallName: "webfetch",
      toolName: "webfetch",
      type: EventType.TOOL_CALL_START,
    },
    { delta: toolArguments, timestamp: 3, toolCallId: "call-webfetch-1", type: EventType.TOOL_CALL_ARGS },
    {
      finishReason: "tool_calls",
      outcome: { type: "success" },
      runId: "run-delegation",
      threadId: "thread-delegation",
      timestamp: 4,
      type: EventType.RUN_FINISHED,
    },
  ] as Array<StreamChunk>
}

function innerCompactionPolicy(overrides: Partial<CompactionPolicy> = {}): CompactionPolicy {
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

function delegatedToolScriptWithPreToolText(toolArguments: string): Array<StreamChunk> {
  return [
    { runId: "run-delegation", threadId: "thread-delegation", timestamp: 1, type: EventType.RUN_STARTED },
    { messageId: "assistant-delegation", role: "assistant", timestamp: 2, type: EventType.TEXT_MESSAGE_START },
    {
      delta: "Before delegation.",
      messageId: "assistant-delegation",
      timestamp: 3,
      type: EventType.TEXT_MESSAGE_CONTENT,
    },
    { messageId: "assistant-delegation", timestamp: 4, type: EventType.TEXT_MESSAGE_END },
    {
      timestamp: 5,
      toolCallId: "call-delegation-1",
      toolCallName: "delegate_task",
      toolName: "delegate_task",
      type: EventType.TOOL_CALL_START,
    },
    { delta: toolArguments, timestamp: 6, toolCallId: "call-delegation-1", type: EventType.TOOL_CALL_ARGS },
    {
      finishReason: "tool_calls",
      outcome: { type: "success" },
      runId: "run-delegation",
      threadId: "thread-delegation",
      timestamp: 7,
      type: EventType.RUN_FINISHED,
    },
  ] as Array<StreamChunk>
}

function multipleDelegatedToolScript(): Array<StreamChunk> {
  return [
    { runId: "run-delegation", threadId: "thread-delegation", timestamp: 1, type: EventType.RUN_STARTED },
    {
      metadata: { providerExecuted: true },
      timestamp: 2,
      toolCallId: "call-delegation-1",
      toolCallName: "delegate_task",
      toolName: "delegate_task",
      type: EventType.TOOL_CALL_START,
    } as StreamChunk,
    {
      delta: '{"task":"return first"}',
      timestamp: 3,
      toolCallId: "call-delegation-1",
      type: EventType.TOOL_CALL_ARGS,
    },
    {
      metadata: { providerExecuted: true },
      timestamp: 4,
      toolCallId: "call-delegation-2",
      toolCallName: "delegate_task",
      toolName: "delegate_task",
      type: EventType.TOOL_CALL_START,
    } as StreamChunk,
    {
      delta: '{"task":"return second"}',
      timestamp: 5,
      toolCallId: "call-delegation-2",
      type: EventType.TOOL_CALL_ARGS,
    },
    {
      content: "second result",
      messageId: "tool-result-2",
      timestamp: 6,
      toolCallId: "call-delegation-2",
      type: EventType.TOOL_CALL_RESULT,
    },
    {
      content: "first result",
      messageId: "tool-result-1",
      timestamp: 7,
      toolCallId: "call-delegation-1",
      type: EventType.TOOL_CALL_RESULT,
    },
    {
      finishReason: "stop",
      outcome: { type: "success" },
      runId: "run-delegation",
      threadId: "thread-delegation",
      timestamp: 8,
      type: EventType.RUN_FINISHED,
    },
  ] as Array<StreamChunk>
}

function duplicateToolResultScript(): Array<StreamChunk> {
  return [
    { runId: "run-delegation", threadId: "thread-delegation", timestamp: 5, type: EventType.RUN_STARTED },
    {
      content: "ping",
      state: "output-available",
      timestamp: 6,
      toolCallId: "call-delegation-1",
      type: EventType.TOOL_CALL_RESULT,
    },
    {
      content: "ping",
      state: "output-available",
      timestamp: 7,
      toolCallId: "call-delegation-1",
      type: EventType.TOOL_CALL_RESULT,
    },
    {
      finishReason: "stop",
      outcome: { type: "success" },
      runId: "run-delegation",
      threadId: "thread-delegation",
      timestamp: 8,
      type: EventType.RUN_FINISHED,
    },
  ] as Array<StreamChunk>
}

function delegatedToolScriptWithRepeatedCallId(toolArguments: string): Array<StreamChunk> {
  return [
    { runId: "run-delegation", threadId: "thread-delegation", timestamp: 10, type: EventType.RUN_STARTED },
    {
      timestamp: 11,
      toolCallId: "call-delegation-1",
      toolCallName: "delegate_task",
      toolName: "delegate_task",
      type: EventType.TOOL_CALL_START,
    },
    { delta: toolArguments, timestamp: 12, toolCallId: "call-delegation-1", type: EventType.TOOL_CALL_ARGS },
    {
      finishReason: "tool_calls",
      outcome: { type: "success" },
      runId: "run-delegation",
      threadId: "thread-delegation",
      timestamp: 13,
      type: EventType.RUN_FINISHED,
    },
  ] as Array<StreamChunk>
}

function finalTextScript(text: string): Array<StreamChunk> {
  return [
    { runId: "run-delegation", threadId: "thread-delegation", timestamp: 5, type: EventType.RUN_STARTED },
    { messageId: "assistant-delegation", role: "assistant", timestamp: 6, type: EventType.TEXT_MESSAGE_START },
    { delta: text, messageId: "assistant-delegation", timestamp: 7, type: EventType.TEXT_MESSAGE_CONTENT },
    { messageId: "assistant-delegation", timestamp: 8, type: EventType.TEXT_MESSAGE_END },
    {
      finishReason: "stop",
      outcome: { type: "success" },
      runId: "run-delegation",
      threadId: "thread-delegation",
      timestamp: 9,
      type: EventType.RUN_FINISHED,
    },
  ] as Array<StreamChunk>
}

function terminalOnlyScript(): Array<StreamChunk> {
  return [
    { runId: "run-delegation", threadId: "thread-delegation", timestamp: 5, type: EventType.RUN_STARTED },
    {
      finishReason: "stop",
      outcome: { type: "success" },
      runId: "run-delegation",
      threadId: "thread-delegation",
      timestamp: 6,
      type: EventType.RUN_FINISHED,
    },
  ] as Array<StreamChunk>
}

function providerContextOverflowScript(): Array<StreamChunk> {
  return [
    { runId: "run-delegation", threadId: "thread-delegation", timestamp: 1, type: EventType.RUN_STARTED },
    {
      code: "provider_context_overflow",
      message: "The provider context window was exceeded.",
      timestamp: 2,
      type: EventType.RUN_ERROR,
    },
  ] as Array<StreamChunk>
}

function textBeforeProviderContextOverflowScript(): Array<StreamChunk> {
  return [
    { runId: "run-delegation", threadId: "thread-delegation", timestamp: 1, type: EventType.RUN_STARTED },
    { messageId: "assistant-delegation", role: "assistant", timestamp: 2, type: EventType.TEXT_MESSAGE_START },
    {
      delta: "Partial response.",
      messageId: "assistant-delegation",
      timestamp: 3,
      type: EventType.TEXT_MESSAGE_CONTENT,
    },
    { messageId: "assistant-delegation", timestamp: 4, type: EventType.TEXT_MESSAGE_END },
    {
      code: "provider_context_overflow",
      message: "The provider context window was exceeded.",
      timestamp: 5,
      type: EventType.RUN_ERROR,
    },
  ] as Array<StreamChunk>
}

function skillToolScript(toolArguments: string): Array<StreamChunk> {
  return [
    { runId: "run-delegation", threadId: "thread-delegation", timestamp: 1, type: EventType.RUN_STARTED },
    {
      timestamp: 2,
      toolCallId: "call-skill-1",
      toolCallName: "skill",
      toolName: "skill",
      type: EventType.TOOL_CALL_START,
    },
    { delta: toolArguments, timestamp: 3, toolCallId: "call-skill-1", type: EventType.TOOL_CALL_ARGS },
    {
      finishReason: "tool_calls",
      outcome: { type: "success" },
      runId: "run-delegation",
      threadId: "thread-delegation",
      timestamp: 4,
      type: EventType.RUN_FINISHED,
    },
  ] as Array<StreamChunk>
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<Array<StreamChunk>> {
  const chunks: Array<StreamChunk> = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

test("runs delegate_task synchronously and collapses intermediate model lifecycles", async () => {
  const scripted = scriptedAdapterCreate([
    delegatedToolScript('{"task":"inspect the project"}'),
    finalTextScript("Delegated task complete."),
  ])
  const delegated: Array<{ signal: AbortSignal; task: string; toolCallId: string }> = []
  const loop = providerDelegationToolLoopCreate({
    adapter: scripted.adapter,
    delegateTask: async (input) => {
      delegated.push(input)
      return "child result"
    },
  })

  const chunks = await collect(
    loop({
      messages: [{ content: "Please delegate this task.", role: "user" }],
      runId: "run-delegation",
      signal: new AbortController().signal,
      threadId: "thread-delegation",
    }),
  )

  expect(delegated).toHaveLength(1)
  expect(delegated[0]).toMatchObject({ task: "inspect the project", toolCallId: "call-delegation-1" })
  expect(chunks.filter((chunk) => chunk.type === EventType.RUN_STARTED)).toHaveLength(1)
  expect(chunks.filter((chunk) => chunk.type === EventType.RUN_FINISHED)).toHaveLength(1)
  expect(chunks.find((chunk) => chunk.type === EventType.TOOL_CALL_RESULT)).toMatchObject({
    content: "child result",
    toolCallId: "call-delegation-1",
  })
  expect(chunks.filter((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT).map((chunk) => chunk.delta)).toEqual([
    "Delegated task complete.",
  ])
  expect(scripted.calls).toHaveLength(2)
  expect(scripted.calls[1]?.some((message) => message.role === "tool" && message.content === "child result")).toBe(true)
})

test("executes the typed delegate_task definition through the supplied registry", async () => {
  const scripted = scriptedAdapterCreate([
    delegatedToolScript('{"agentId":" explore ","task":"inspect the project"}'),
    finalTextScript("Delegated task complete."),
  ])
  const registry = toolRegistryCreate()
  const delegated: Array<{ agentId?: string; signal: AbortSignal; task: string; toolCallId: string }> = []
  const registered = registry.register(
    delegateTaskToolCreate({
      execute: async (input) => {
        delegated.push(input)
        return "child result"
      },
    }),
  )
  expect(registered.success).toBe(true)

  const chunks = await collect(
    providerDelegationToolLoopCreate({ adapter: scripted.adapter, toolRegistry: registry })({
      messages: [{ content: "Please delegate this task.", role: "user" }],
      runId: "run-delegation",
      signal: new AbortController().signal,
      threadId: "thread-delegation",
    }),
  )

  expect(delegated).toHaveLength(1)
  expect(delegated[0]).toMatchObject({
    agentId: "explore",
    task: "inspect the project",
    toolCallId: "call-delegation-1",
  })
  expect(delegated[0]?.signal).toBeInstanceOf(AbortSignal)
  expect(chunks.find((chunk) => chunk.type === EventType.TOOL_CALL_RESULT)).toMatchObject({
    content: "child result",
    toolCallId: "call-delegation-1",
  })
})

test("does not advertise a disabled registry-backed delegate_task", async () => {
  const scripted = scriptedAdapterCreate([terminalOnlyScript()])
  const registry = toolRegistryCreate()
  const registered = registry.register({
    ...delegateTaskToolCreate({ execute: () => "must not run" }),
    enabled: false,
  })
  expect(registered.success).toBe(true)

  await collect(
    providerDelegationToolLoopCreate({ adapter: scripted.adapter, toolRegistry: registry })({
      messages: [{ content: "Do not delegate.", role: "user" }],
      runId: "run-delegation",
      signal: new AbortController().signal,
      threadId: "thread-delegation",
    }),
  )

  expect(scripted.toolCounts).toEqual([0])
})

test("rejects a disabled bash and does not advertise it to the provider", async () => {
  const scripted = scriptedAdapterCreate([terminalOnlyScript()])
  const registry = toolRegistryCreate()
  const registered = registry.register({
    ...bashToolCreate({ projectRoot: "/tmp" }),
    enabled: false,
  })
  expect(registered.success).toBe(true)

  const rejected = await registry.execute(
    "bash",
    { command: "printf never" },
    {
      signal: new AbortController().signal,
      toolCallId: "call-disabled-bash",
    },
  )
  expect(rejected).toMatchObject({
    code: "tool.disabled",
    errorMessage: "The bash tool is disabled.",
    success: false,
  })

  await collect(
    providerDelegationToolLoopCreate({ adapter: scripted.adapter, enabledTools: [], toolRegistry: registry })({
      messages: [{ content: "Do not run bash.", role: "user" }],
      runId: "run-delegation",
      signal: new AbortController().signal,
      threadId: "thread-delegation",
    }),
  )
  expect(scripted.toolCounts).toEqual([0])
})

test("executes enabled webfetch and emits replay-safe normalized lifecycle events", async () => {
  const scripted = scriptedAdapterCreate([
    webfetchToolScript('{"format":"text","url":"https://example.test/fetch"}'),
    finalTextScript("Fetched successfully."),
  ])
  const requests: string[] = []
  const chunks = await collect(
    providerDelegationToolLoopCreate({
      adapter: scripted.adapter,
      enabledTools: ["webfetch"],
      webfetch: {
        fetch: async (input) => {
          requests.push(typeof input === "string" ? input : input.toString())
          return new Response("fetched content", { headers: { "content-type": "text/plain" } })
        },
      },
    })({
      messages: [{ content: "Fetch the page.", role: "user" }],
      runId: "run-delegation",
      signal: new AbortController().signal,
      threadId: "thread-delegation",
    }),
  )

  expect(requests).toEqual(["https://example.test/fetch"])
  expect(scripted.toolCounts).toEqual([1, 1])
  const toolResult = chunks.find((chunk) => chunk.type === EventType.TOOL_CALL_RESULT)
  expect(toolResult).toMatchObject({ toolCallId: "call-webfetch-1" })
  expect(JSON.stringify(toolResult)).toContain("fetched content")

  const normalized = chunks.flatMap((chunk) => {
    const providerEvent = providerExecutionEventFromStreamChunk(chunk)
    if (!providerEvent.success || providerEvent.data === null) return []
    const durableEvent = executionStreamEventNormalize(providerEvent.data)
    return durableEvent.success ? [durableEvent.data] : []
  })
  expect(normalized.map((event) => event.eventType)).toEqual(["tool_start", "tool_result", "text_delta", "terminal"])
  const replayNormalized = chunks.map((chunk, index) => ({ ...chunk, timestamp: 10_000 + index }))
  const replayEvents = replayNormalized.flatMap((chunk) => {
    const providerEvent = providerExecutionEventFromStreamChunk(chunk)
    if (!providerEvent.success || providerEvent.data === null) return []
    const durableEvent = executionStreamEventNormalize(providerEvent.data)
    return durableEvent.success ? [durableEvent.data] : []
  })
  expect(replayEvents).toEqual(normalized)
  expect(JSON.stringify(normalized)).not.toContain("timestamp")
  expect(normalized.at(1)).toMatchObject({
    eventType: "tool_result",
    payload: { outcome: "success", toolCallId: "call-webfetch-1", truncated: false },
  })
})

test("emits a replay-safe error lifecycle for a failed webfetch", async () => {
  const scripted = scriptedAdapterCreate([
    webfetchToolScript('{"url":"https://example.test/image.png"}'),
    finalTextScript("The fetch failed safely."),
  ])
  const chunks = await collect(
    providerDelegationToolLoopCreate({
      adapter: scripted.adapter,
      enabledTools: ["webfetch"],
      webfetch: {
        fetch: async () => new Response("binary", { headers: { "content-type": "image/png" } }),
      },
    })({
      messages: [{ content: "Fetch the image.", role: "user" }],
      runId: "run-delegation",
      signal: new AbortController().signal,
      threadId: "thread-delegation",
    }),
  )

  const normalized = chunks.flatMap((chunk) => {
    const providerEvent = providerExecutionEventFromStreamChunk(chunk)
    if (!providerEvent.success || providerEvent.data === null) return []
    const durableEvent = executionStreamEventNormalize(providerEvent.data)
    return durableEvent.success ? [durableEvent.data] : []
  })
  expect(normalized.map((event) => event.eventType)).toEqual(["tool_start", "tool_result", "text_delta", "terminal"])
  expect(normalized.at(1)).toMatchObject({
    eventType: "tool_result",
    payload: { outcome: "error", toolCallId: "call-webfetch-1" },
  })
  expect(JSON.stringify(normalized)).not.toContain("binary")

  const replayEvents = chunks.flatMap((chunk, index) => {
    const providerEvent = providerExecutionEventFromStreamChunk({ ...chunk, timestamp: 20_000 + index })
    if (!providerEvent.success || providerEvent.data === null) return []
    const durableEvent = executionStreamEventNormalize(providerEvent.data)
    return durableEvent.success ? [durableEvent.data] : []
  })
  expect(replayEvents).toEqual(normalized)
})

test("does not advertise or execute a disabled webfetch tool", async () => {
  const scripted = scriptedAdapterCreate([terminalOnlyScript()])
  let executions = 0
  const registry = toolRegistryCreate()
  const registered = registry.register({
    ...webfetchToolCreate({
      execute: async () => {
        executions += 1
        return {
          success: true,
          data: {
            contentType: "text/plain",
            format: "text" as const,
            output: "must not run",
            truncated: false,
            url: "https://example.test/disabled",
          },
        }
      },
    }),
    enabled: false,
  })
  expect(registered.success).toBe(true)

  const rejected = await registry.execute(
    "webfetch",
    { url: "https://example.test/disabled" },
    { signal: new AbortController().signal, toolCallId: "call-disabled-webfetch" },
  )
  expect(rejected).toMatchObject({
    code: "tool.disabled",
    errorMessage: "The webfetch tool is disabled.",
    success: false,
  })

  await collect(
    providerDelegationToolLoopCreate({ adapter: scripted.adapter, enabledTools: [], toolRegistry: registry })({
      messages: [{ content: "Do not fetch.", role: "user" }],
      runId: "run-delegation",
      signal: new AbortController().signal,
      threadId: "thread-delegation",
    }),
  )
  expect(executions).toBe(0)
  expect(scripted.toolCounts).toEqual([0])
})

test("returns a successful delegation result when the continuation has no assistant text", async () => {
  const scripted = scriptedAdapterCreate([delegatedToolScript('{"task":"return ping"}'), terminalOnlyScript()])
  const loop = providerDelegationToolLoopCreate({
    adapter: scripted.adapter,
    delegateTask: () => "ping",
  })

  const chunks = await collect(
    loop({
      messages: [{ content: "Please delegate this task.", role: "user" }],
      runId: "run-delegation",
      signal: new AbortController().signal,
      threadId: "thread-delegation",
    }),
  )

  expect(chunks.filter((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT).map((chunk) => chunk.delta)).toEqual([
    "ping",
  ])
  expect(chunks.filter((chunk) => chunk.type === EventType.TEXT_MESSAGE_START)).toHaveLength(1)
  expect(chunks.filter((chunk) => chunk.type === EventType.TEXT_MESSAGE_END)).toHaveLength(1)
  expect(chunks.filter((chunk) => chunk.type === EventType.RUN_FINISHED)).toHaveLength(1)
})

test("returns the delegated result after pre-tool text when the continuation is empty", async () => {
  const scripted = scriptedAdapterCreate([
    delegatedToolScriptWithPreToolText('{"task":"return ping"}'),
    terminalOnlyScript(),
  ])
  const loop = providerDelegationToolLoopCreate({
    adapter: scripted.adapter,
    delegateTask: () => "ping",
  })

  const chunks = await collect(
    loop({
      messages: [{ content: "Please delegate this task.", role: "user" }],
      runId: "run-delegation",
      signal: new AbortController().signal,
      threadId: "thread-delegation",
    }),
  )

  expect(chunks.filter((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT).map((chunk) => chunk.delta)).toEqual([
    "Before delegation.",
    "ping",
  ])
})

test("deduplicates delegated result events by tool call ID", async () => {
  const scripted = scriptedAdapterCreate([delegatedToolScript('{"task":"return ping"}'), duplicateToolResultScript()])
  const loop = providerDelegationToolLoopCreate({
    adapter: scripted.adapter,
    delegateTask: () => "ping",
  })

  const chunks = await collect(
    loop({
      messages: [{ content: "Please delegate this task.", role: "user" }],
      runId: "run-delegation",
      signal: new AbortController().signal,
      threadId: "thread-delegation",
    }),
  )

  expect(chunks.filter((chunk) => chunk.type === EventType.TOOL_CALL_RESULT)).toHaveLength(1)
  expect(chunks.filter((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT).map((chunk) => chunk.delta)).toEqual([
    "ping",
  ])
})

test("allows a tool call ID to be reused in a later model round", async () => {
  const scripted = scriptedAdapterCreate([
    delegatedToolScript('{"task":"first task"}'),
    delegatedToolScriptWithRepeatedCallId('{"task":"second task"}'),
    terminalOnlyScript(),
  ])
  const delegatedTasks: Array<string> = []
  const loop = providerDelegationToolLoopCreate({
    adapter: scripted.adapter,
    delegateTask: ({ task }) => {
      delegatedTasks.push(task)
      return `${task} result`
    },
  })

  const chunks = await collect(
    loop({
      messages: [{ content: "Repeat the delegation.", role: "user" }],
      runId: "run-delegation",
      signal: new AbortController().signal,
      threadId: "thread-delegation",
    }),
  )

  expect(delegatedTasks).toEqual(["first task", "second task"])
  expect(chunks.filter((chunk) => chunk.type === EventType.TOOL_CALL_RESULT)).toHaveLength(2)
  expect(chunks.filter((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT).map((chunk) => chunk.delta)).toEqual([
    "second task result",
  ])
})

test("keeps canonical delegated presentation in source order when results complete out of order", async () => {
  const scripted = scriptedAdapterCreate([multipleDelegatedToolScript(), terminalOnlyScript()])
  const loop = providerDelegationToolLoopCreate({
    adapter: scripted.adapter,
  })

  const chunks = await collect(
    loop({
      messages: [{ content: "Delegate both tasks.", role: "user" }],
      runId: "run-delegation",
      signal: new AbortController().signal,
      threadId: "thread-delegation",
    }),
  )

  expect(chunks.filter((chunk) => chunk.type === EventType.TOOL_CALL_RESULT).map((chunk) => chunk.toolCallId)).toEqual([
    "call-delegation-2",
    "call-delegation-1",
  ])
  expect(chunks.filter((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT).map((chunk) => chunk.delta)).toEqual([
    "first result\nsecond result",
  ])
})

test("does not fall back to an error result", async () => {
  const scripted = scriptedAdapterCreate([delegatedToolScript('{"task":"fail"}'), terminalOnlyScript()])
  const loop = providerDelegationToolLoopCreate({
    adapter: scripted.adapter,
    delegateTask: () => {
      throw new Error("delegated failure")
    },
  })

  const chunks = await collect(
    loop({
      messages: [{ content: "Fail the delegated task.", role: "user" }],
      runId: "run-delegation",
      signal: new AbortController().signal,
      threadId: "thread-delegation",
    }),
  )

  expect(chunks.filter((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT)).toHaveLength(0)
  expect(chunks.find((chunk) => chunk.type === EventType.TOOL_CALL_RESULT)).toMatchObject({ state: "output-error" })
})

test("propagates the selected child agent through the delegation tool", async () => {
  const scripted = scriptedAdapterCreate([
    delegatedToolScript('{"agentId":"explore","task":"inspect the project"}'),
    finalTextScript("Delegated task complete."),
  ])
  let selectedAgentId: string | undefined
  const loop = providerDelegationToolLoopCreate({
    adapter: scripted.adapter,
    delegateTask: async (input) => {
      selectedAgentId = input.agentId
      return "child result"
    },
  })

  await collect(
    loop({
      messages: [{ content: "Please delegate this task.", role: "user" }],
      runId: "run-delegation",
      signal: new AbortController().signal,
      threadId: "thread-delegation",
    }),
  )

  expect(selectedAgentId).toBe("explore")
})

test("validates raw delegate_task input and bounds returned text", async () => {
  const invalidScripted = scriptedAdapterCreate([
    delegatedToolScript('{"task":42}'),
    finalTextScript("Invalid delegation was reported."),
  ])
  let invalidCalls = 0
  const invalidLoop = providerDelegationToolLoopCreate({
    adapter: invalidScripted.adapter,
    delegateTask: () => {
      invalidCalls += 1
      return "must not run"
    },
  })
  const invalidChunks = await collect(
    invalidLoop({
      messages: [{ content: "Validate the task.", role: "user" }],
      runId: "run-delegation",
      signal: new AbortController().signal,
      threadId: "thread-delegation",
    }),
  )
  expect(invalidCalls).toBe(0)
  expect(invalidChunks.find((chunk) => chunk.type === EventType.TOOL_CALL_RESULT)).toMatchObject({
    state: "output-error",
  })

  const boundedScripted = scriptedAdapterCreate([
    delegatedToolScript('{"task":"return a large result"}'),
    finalTextScript("Bounded delegation was reported."),
  ])
  const boundedLoop = providerDelegationToolLoopCreate({
    adapter: boundedScripted.adapter,
    delegateTask: () => "x".repeat(20_000),
  })
  const boundedChunks = await collect(
    boundedLoop({
      messages: [{ content: "Bound the result.", role: "user" }],
      runId: "run-delegation",
      signal: new AbortController().signal,
      threadId: "thread-delegation",
    }),
  )
  const boundedResult = boundedChunks.find((chunk) => chunk.type === EventType.TOOL_CALL_RESULT)
  expect(boundedResult).toMatchObject({ content: "x".repeat(16_384) })
})

test("propagates cancellation to the synchronous delegation callback", async () => {
  const scripted = scriptedAdapterCreate([delegatedToolScript('{"task":"wait for cancellation"}')])
  const controller = new AbortController()
  let callbackAborted = false
  let callbackStartedResolve: () => void = () => undefined
  const callbackStarted = new Promise<void>((resolve) => {
    callbackStartedResolve = resolve
  })
  const loop = providerDelegationToolLoopCreate({
    adapter: scripted.adapter,
    delegateTask: ({ signal }) => {
      callbackStartedResolve()
      return new Promise<string>((resolve) => {
        signal.addEventListener(
          "abort",
          () => {
            callbackAborted = true
            resolve("cancelled")
          },
          { once: true },
        )
      })
    },
  })

  const chunksPromise = collect(
    loop({
      messages: [{ content: "Cancel the delegated task.", role: "user" }],
      runId: "run-delegation",
      signal: controller.signal,
      threadId: "thread-delegation",
    }),
  )
  await callbackStarted
  controller.abort()
  const chunks = await chunksPromise

  expect(callbackAborted).toBe(true)
  expect(chunks.at(-1)).toMatchObject({ outcome: { type: "interrupt" }, type: EventType.RUN_FINISHED })
  const providerEvent = providerExecutionEventFromStreamChunk(chunks.at(-1))
  expect(providerEvent).toMatchObject({ data: { status: "aborted", type: "terminal" }, success: true })
})

test("keeps provider tool events compatible with the existing normalization seam", async () => {
  const scripted = scriptedAdapterCreate([
    delegatedToolScript('{"task":"normalize this"}'),
    finalTextScript("Normalized."),
  ])
  const loop = providerDelegationToolLoopCreate({
    adapter: scripted.adapter,
    delegateTask: () => "normalized child result",
  })
  const chunks = await collect(
    loop({
      messages: [{ content: "Normalize the delegation.", role: "user" }],
      runId: "run-delegation",
      signal: new AbortController().signal,
      threadId: "thread-delegation",
    }),
  )

  const normalized = chunks.flatMap((chunk) => {
    const providerEvent = providerExecutionEventFromStreamChunk(chunk)
    if (!providerEvent.success || providerEvent.data === null) return []
    const durableEvent = executionStreamEventNormalize(providerEvent.data)
    return durableEvent.success ? [durableEvent.data] : []
  })

  expect(normalized.map((event) => event.eventType)).toEqual(["tool_start", "tool_result", "text_delta", "terminal"])
  expect(normalized.filter((event) => event.eventType === "terminal")).toHaveLength(1)
  expect(normalized.at(-1)).toMatchObject({ eventType: "terminal", payload: { status: "completed" } })
})

test("hands off snapshotted nested instructions after a bash working-directory result", async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-provider-bash-"))
  const nestedDirectory = path.join(projectRoot, "nested")
  await fs.mkdir(nestedDirectory, { recursive: true })
  const rootContent = "Root instructions for bash."
  const nestedContent = "Nested instructions for the next model turn."
  const snapshotEntry = (canonicalPath: string, content: string, precedence: number, scope: string) => ({
    canonicalPath,
    content,
    digest: `sha256-${createHash("sha256").update(content, "utf8").digest("hex")}`,
    precedence,
    scope,
    size: Buffer.byteLength(content, "utf8"),
    source: "project" as const,
  })

  try {
    const scripted = scriptedAdapterCreate([
      bashToolScript('{"command":"printf bash-result","workingDirectory":"nested"}'),
      terminalOnlyScript(),
    ])
    const chunks = await collect(
      providerDelegationToolLoopCreate({
        adapter: scripted.adapter,
        bash: { projectRoot },
        enabledTools: ["bash"],
        instructionContext: {
          projectRoot,
          snapshot: {
            snapshots: [
              snapshotEntry(path.join(projectRoot, "AGENTS.md"), rootContent, 1, "."),
              snapshotEntry(path.join(nestedDirectory, "AGENTS.md"), nestedContent, 2, "nested"),
            ],
            version: 1,
          },
        },
      })({
        messages: [{ content: "Run bash in nested.", role: "user" }],
        runId: "run-delegation",
        signal: new AbortController().signal,
        threadId: "thread-delegation",
      }),
    )

    expect(chunks.find((chunk) => chunk.type === EventType.TOOL_CALL_RESULT)).toMatchObject({
      toolCallId: "call-bash-1",
    })
    expect(scripted.toolCounts).toEqual([1, 1])
    expect(scripted.systemPrompts[0]).toContain(rootContent)
    expect(scripted.systemPrompts[0]).not.toContain(nestedContent)
    expect(scripted.systemPrompts[1]).toContain(rootContent)
    expect(scripted.systemPrompts[1]).toContain(nestedContent)
  } finally {
    await fs.rm(projectRoot, { force: true, recursive: true })
  }
})

test("does not carry a bash working-directory overlay into a retry round", async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-provider-bash-retry-"))
  const nestedDirectory = path.join(projectRoot, "nested")
  await fs.mkdir(nestedDirectory, { recursive: true })
  const rootContent = "Root retry instructions."
  const nestedContent = "Stale nested retry instructions."
  const instruction = (canonicalPath: string, content: string, precedence: number, scope: string) => ({
    canonicalPath,
    content,
    digest: `sha256-${createHash("sha256").update(content, "utf8").digest("hex")}`,
    precedence,
    scope,
    size: Buffer.byteLength(content, "utf8"),
    source: "project" as const,
  })

  try {
    const scripted = scriptedAdapterCreate([
      bashToolScript('{"command":"true","workingDirectory":"nested"}'),
      terminalOnlyScript(),
      terminalOnlyScript(),
    ])
    const loop = providerDelegationToolLoopCreate({
      adapter: scripted.adapter,
      bash: { projectRoot },
      enabledTools: ["bash"],
      instructionContext: {
        projectRoot,
        snapshot: {
          snapshots: [
            instruction(path.join(projectRoot, "AGENTS.md"), rootContent, 1, "."),
            instruction(path.join(nestedDirectory, "AGENTS.md"), nestedContent, 2, "nested"),
          ],
          version: 1,
        },
      },
    })

    await collect(
      loop({
        messages: [{ content: "First attempt.", role: "user" }],
        runId: "run-delegation",
        signal: new AbortController().signal,
        threadId: "thread-delegation",
      }),
    )
    await collect(
      loop({
        messages: [{ content: "Retry without the old tool result.", role: "user" }],
        runId: "run-delegation",
        signal: new AbortController().signal,
        threadId: "thread-delegation",
      }),
    )

    expect(scripted.systemPrompts[1]).toContain(nestedContent)
    expect(scripted.systemPrompts[2]).toContain(rootContent)
    expect(scripted.systemPrompts[2]).not.toContain(nestedContent)
  } finally {
    await fs.rm(projectRoot, { force: true, recursive: true })
  }
})

test("advertises the active skill catalog and executes the snapshotted skill tool in provider rounds", async () => {
  const rootDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-provider-skill-"))
  const globalSkillsPath = path.join(rootDirectory, "global", "skills")
  const projectRoot = path.join(rootDirectory, "project")
  const skillDirectory = path.join(projectRoot, ".agents", "skills", "demo")
  await fs.mkdir(skillDirectory, { recursive: true })
  await fs.writeFile(
    path.join(skillDirectory, "SKILL.md"),
    ["---", "name: demo", "description: Provider demo skill", "---", "Use the snapshotted provider instructions."].join(
      "\n",
    ),
    "utf8",
  )

  try {
    const catalog = await skillCatalogDiscover({ globalSkillsPath, projectRoot })
    expect(catalog.success).toBe(true)
    if (!catalog.success) return
    const demo = catalog.data.skills.find(({ name }) => name === "demo")
    if (demo === undefined) return

    const scripted = scriptedAdapterCreate([
      skillToolScript('{"name":"demo"}'),
      finalTextScript("Skill loaded successfully."),
    ])
    const chunks = await collect(
      providerDelegationToolLoopCreate({ adapter: scripted.adapter, skillSnapshots: [demo] })({
        messages: [{ content: "Load the skill.", role: "user" }],
        runId: "run-delegation",
        signal: new AbortController().signal,
        threadId: "thread-delegation",
      }),
    )

    expect(scripted.toolCounts).toEqual([1, 1])
    expect(scripted.systemPrompts[0]).toContain("Available skills:")
    expect(scripted.systemPrompts[0]).toContain("- demo: Provider demo skill")
    expect(JSON.stringify(scripted.calls[1])).toContain("Use the snapshotted provider instructions.")
    expect(chunks.filter((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT).map((chunk) => chunk.delta)).toEqual(
      ["Skill loaded successfully."],
    )
  } finally {
    await fs.rm(rootDirectory, { force: true, recursive: true })
  }
})

test("compacts once before the first round and carries the projection into the next round", async () => {
  const provider = scriptedAdapterCreate([
    delegatedToolScript('{"task":"inspect the project"}'),
    finalTextScript("Finished after the tool result."),
  ])
  const summary = summaryScriptedAdapterCreate([finalTextScript("Structured pressure summary.")])
  const messages: Array<ModelMessage> = Array.from({ length: 6 }, (_, index) => ({
    content: `Old context ${index} ${"x".repeat(400)}`,
    role: "user" as const,
  }))

  await collect(
    providerDelegationToolLoopCreate({
      adapter: provider.adapter,
      compactionAdapter: summary.adapter,
      compactionPolicy: innerCompactionPolicy(),
      delegateTask: () => "tool result",
    })({
      messages,
      runId: "run-delegation",
      signal: new AbortController().signal,
      threadId: "thread-delegation",
    }),
  )

  expect(summary.calls).toHaveLength(1)
  expect(summary.toolCounts).toEqual([0])
  expect(summary.calls[0]?.[0]?.content).toContain("Transcript to summarize:")
  expect(provider.calls).toHaveLength(2)
  expect(provider.calls[0]?.[0]).toMatchObject({ content: "Structured pressure summary.", role: "system" })
  expect(provider.calls[1]?.[0]).toMatchObject({ content: "Structured pressure summary.", role: "system" })
  expect(provider.calls[1]?.some((message) => message.role === "assistant" && message.toolCalls?.length === 1)).toBe(
    true,
  )
  expect(provider.calls[1]?.some((message) => message.role === "tool" && message.content === "tool result")).toBe(true)
})

test("keeps an assistant tool call and its matching result together at the compaction boundary", async () => {
  const provider = scriptedAdapterCreate([terminalOnlyScript()])
  const summary = summaryScriptedAdapterCreate([finalTextScript("Summary with the old tool unit.")])
  const messages: Array<ModelMessage> = [
    { content: "Old context 0", role: "user" },
    { content: "Old context 1", role: "user" },
    { content: "Old context 2", role: "user" },
    {
      content: "Running the old tool.",
      role: "assistant",
      toolCalls: [
        {
          function: { arguments: '{"task":"old task"}', name: "delegate_task" },
          id: "call-old",
          type: "function",
        },
      ],
    },
    { content: "old tool result", role: "tool", toolCallId: "call-old" },
    { content: "Keep this recent request.", role: "user" },
  ]

  await collect(
    providerDelegationToolLoopCreate({
      adapter: provider.adapter,
      compactionAdapter: summary.adapter,
      compactionPolicy: innerCompactionPolicy({ recentTokenBudget: 70 }),
    })({
      messages,
      runId: "run-delegation",
      signal: new AbortController().signal,
      threadId: "thread-delegation",
    }),
  )

  const projected = provider.calls[0] ?? []
  const assistantIndex = projected.findIndex(
    (message) => message.role === "assistant" && message.toolCalls?.length === 1,
  )
  expect(assistantIndex).toBeGreaterThanOrEqual(0)
  expect(projected[assistantIndex + 1]).toMatchObject({
    content: "old tool result",
    role: "tool",
    toolCallId: "call-old",
  })
})

test("keeps original messages when inner compaction has no eligible lifecycle", async () => {
  const provider = scriptedAdapterCreate([terminalOnlyScript()])
  const summary = summaryScriptedAdapterCreate([finalTextScript("Should not be requested.")])
  const messages: Array<ModelMessage> = [
    { content: "Earlier request.", role: "user" },
    { content: "orphan result", role: "tool", toolCallId: "missing-call" },
  ]

  await collect(
    providerDelegationToolLoopCreate({
      adapter: provider.adapter,
      compactionAdapter: summary.adapter,
      compactionPolicy: innerCompactionPolicy(),
    })({
      messages,
      runId: "run-delegation",
      signal: new AbortController().signal,
      threadId: "thread-delegation",
    }),
  )

  expect(summary.calls).toHaveLength(0)
  expect(provider.calls[0]).toEqual(messages)
})

test("keeps original messages for failed, empty, truncated, tool-emitting, and non-shrinking summaries", async () => {
  const cases: Array<[string, Array<StreamChunk>]> = [
    ["failed", [{ code: "summary_failed", message: "failed", timestamp: 1, type: EventType.RUN_ERROR }]],
    [
      "empty",
      [
        {
          finishReason: "stop",
          outcome: { type: "success" },
          runId: "summary-run",
          threadId: "summary-thread",
          timestamp: 1,
          type: EventType.RUN_FINISHED,
        },
      ],
    ],
    [
      "truncated",
      finalTextScript("truncated").map((chunk) =>
        chunk.type === EventType.RUN_FINISHED ? { ...chunk, finishReason: "length" } : chunk,
      ),
    ],
    ["tool-emitting", delegatedToolScript('{"task":"not allowed"}')],
    ["non-shrinking", finalTextScript("y".repeat(5_000))],
  ]

  for (const [name, summaryScript] of cases) {
    const provider = scriptedAdapterCreate([terminalOnlyScript()])
    const summary = summaryScriptedAdapterCreate([summaryScript])
    const messages: Array<ModelMessage> = Array.from({ length: 6 }, (_, index) => ({
      content: `Old context ${index} ${"x".repeat(400)}`,
      role: "user" as const,
    }))

    await collect(
      providerDelegationToolLoopCreate({
        adapter: provider.adapter,
        compactionAdapter: summary.adapter,
        compactionPolicy: innerCompactionPolicy({ maxSummaryChars: 6_000 }),
      })({
        messages,
        runId: `run-${name}`,
        signal: new AbortController().signal,
        threadId: `thread-${name}`,
      }),
    )

    expect(provider.calls[0], name).toEqual(messages)
    expect(summary.calls, name).toHaveLength(1)
  }
})

test("keeps original messages when auto compaction or context metadata is disabled or missing", async () => {
  for (const mode of ["disabled", "missing-context"] as const) {
    const provider = scriptedAdapterCreate([terminalOnlyScript()])
    const summary = summaryScriptedAdapterCreate([finalTextScript("Should not be requested.")])
    const messages: Array<ModelMessage> = Array.from({ length: 6 }, (_, index) => ({
      content: `Old context ${index} ${"x".repeat(400)}`,
      role: "user" as const,
    }))

    await collect(
      providerDelegationToolLoopCreate({
        adapter: provider.adapter,
        compactionAdapter: summary.adapter,
        ...(mode === "disabled" ? { compactionAuto: false, compactionPolicy: innerCompactionPolicy() } : {}),
        ...(mode === "missing-context" ? { compactionPolicy: { pressureThreshold: 0.01 } } : {}),
      })({
        messages,
        runId: `run-${mode}`,
        signal: new AbortController().signal,
        threadId: `thread-${mode}`,
      }),
    )

    expect(summary.calls, mode).toHaveLength(0)
    expect(provider.calls[0], mode).toEqual(messages)
  }
})

test("keeps the default tool-loop request path unchanged when inner compaction is not configured", async () => {
  const provider = scriptedAdapterCreate([terminalOnlyScript()])
  const messages: Array<ModelMessage> = [{ content: "Small request.", role: "user" }]

  await collect(
    providerDelegationToolLoopCreate({ adapter: provider.adapter })({
      messages,
      runId: "run-delegation",
      signal: new AbortController().signal,
      threadId: "thread-delegation",
    }),
  )

  expect(provider.calls).toHaveLength(1)
  expect(provider.calls[0]).toEqual(messages)
})

test("recovers one inner overflow after a completed tool result without rerunning the callback", async () => {
  const provider = scriptedAdapterCreate([
    delegatedToolScript('{"task":"inspect the project"}'),
    providerContextOverflowScript(),
    finalTextScript("Recovered after inner compaction."),
  ])
  const summary = summaryScriptedAdapterCreate([finalTextScript("Inner overflow summary.")])
  const messages: Array<ModelMessage> = Array.from({ length: 6 }, (_, index) => ({
    content: `Old context ${index} ${"x".repeat(400)}`,
    role: "user" as const,
  }))
  let callbackCount = 0

  const chunks = await collect(
    providerDelegationToolLoopCreate({
      adapter: provider.adapter,
      compaction: {
        maxOverflowRetries: 1,
        policy: innerCompactionPolicy({ contextLimitTokens: 100_000, pressureThreshold: 1 }),
        summaryAdapter: summary.adapter,
      },
      delegateTask: () => {
        callbackCount += 1
        return "completed tool result"
      },
    })({
      messages,
      runId: "run-delegation",
      signal: new AbortController().signal,
      threadId: "thread-delegation",
    }),
  )

  expect(callbackCount).toBe(1)
  expect(summary.calls).toHaveLength(1)
  expect(summary.toolCounts).toEqual([0])
  expect(provider.calls).toHaveLength(3)
  expect(
    provider.calls[2]?.some((message) => message.role === "tool" && message.content === "completed tool result"),
  ).toBe(true)
  expect(chunks.filter((chunk) => chunk.type === EventType.RUN_ERROR)).toHaveLength(0)
  expect(chunks.filter((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT).map((chunk) => chunk.delta)).toEqual([
    "Recovered after inner compaction.",
  ])
})

test("bounds repeated inner overflow recovery to the configured round retry count", async () => {
  const provider = scriptedAdapterCreate([providerContextOverflowScript(), providerContextOverflowScript()])
  const summary = summaryScriptedAdapterCreate([finalTextScript("Inner overflow summary.")])

  const chunks = await collect(
    providerDelegationToolLoopCreate({
      adapter: provider.adapter,
      compaction: {
        maxOverflowRetries: 1,
        policy: innerCompactionPolicy({ contextLimitTokens: 100_000, pressureThreshold: 1 }),
        summaryAdapter: summary.adapter,
      },
    })({
      messages: Array.from({ length: 6 }, (_, index) => ({
        content: `Old context ${index} ${"x".repeat(400)}`,
        role: "user" as const,
      })),
      runId: "run-delegation",
      signal: new AbortController().signal,
      threadId: "thread-delegation",
    }),
  )

  expect(provider.calls).toHaveLength(2)
  expect(summary.calls).toHaveLength(1)
  expect(chunks.filter((chunk) => chunk.type === EventType.RUN_ERROR)).toHaveLength(1)
  expect(chunks.find((chunk) => chunk.type === EventType.RUN_ERROR)).toMatchObject({
    code: "provider_context_overflow",
  })
})

test("preserves terminal overflow behavior when inner compaction makes no progress", async () => {
  const provider = scriptedAdapterCreate([providerContextOverflowScript()])
  const summary = summaryScriptedAdapterCreate([finalTextScript("x".repeat(5_000))])

  const chunks = await collect(
    providerDelegationToolLoopCreate({
      adapter: provider.adapter,
      compaction: {
        maxOverflowRetries: 1,
        policy: innerCompactionPolicy({ contextLimitTokens: 100_000, maxSummaryChars: 6_000, pressureThreshold: 1 }),
        summaryAdapter: summary.adapter,
      },
    })({
      messages: Array.from({ length: 6 }, (_, index) => ({
        content: `Old context ${index} ${"x".repeat(400)}`,
        role: "user" as const,
      })),
      runId: "run-delegation",
      signal: new AbortController().signal,
      threadId: "thread-delegation",
    }),
  )

  expect(provider.calls).toHaveLength(1)
  expect(summary.calls).toHaveLength(1)
  expect(chunks.find((chunk) => chunk.type === EventType.RUN_ERROR)).toMatchObject({
    code: "provider_context_overflow",
  })
})

test("does not retry an inner overflow after the request emitted content", async () => {
  const provider = scriptedAdapterCreate([textBeforeProviderContextOverflowScript()])
  const summary = summaryScriptedAdapterCreate([finalTextScript("Should not be requested.")])

  const chunks = await collect(
    providerDelegationToolLoopCreate({
      adapter: provider.adapter,
      compaction: {
        maxOverflowRetries: 1,
        policy: innerCompactionPolicy({ contextLimitTokens: 100_000, pressureThreshold: 1 }),
        summaryAdapter: summary.adapter,
      },
    })({
      messages: Array.from({ length: 6 }, (_, index) => ({
        content: `Old context ${index} ${"x".repeat(400)}`,
        role: "user" as const,
      })),
      runId: "run-delegation",
      signal: new AbortController().signal,
      threadId: "thread-delegation",
    }),
  )

  expect(provider.calls).toHaveLength(1)
  expect(summary.calls).toHaveLength(0)
  expect(chunks.filter((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT).map((chunk) => chunk.delta)).toEqual([
    "Partial response.",
  ])
  expect(chunks.find((chunk) => chunk.type === EventType.RUN_ERROR)).toMatchObject({
    code: "provider_context_overflow",
  })
})

test("does not retry an inner overflow after abort", async () => {
  const controller = new AbortController()
  const provider = scriptedAdapterCreate([providerContextOverflowScript()])
  const summary = summaryScriptedAdapterCreate([finalTextScript("Should not be requested.")])
  const summaryAdapter = Object.create(summary.adapter) as AnyTextAdapter
  summaryAdapter.chatStream = (input: Parameters<AnyTextAdapter["chatStream"]>[0]) => {
    controller.abort()
    return summary.adapter.chatStream(input)
  }

  const chunks = await collect(
    providerDelegationToolLoopCreate({
      adapter: provider.adapter,
      compaction: {
        maxOverflowRetries: 1,
        policy: innerCompactionPolicy({ contextLimitTokens: 100_000, pressureThreshold: 1 }),
        summaryAdapter: summaryAdapter,
      },
    })({
      messages: Array.from({ length: 6 }, (_, index) => ({
        content: `Old context ${index} ${"x".repeat(400)}`,
        role: "user" as const,
      })),
      runId: "run-delegation",
      signal: controller.signal,
      threadId: "thread-delegation",
    }),
  )

  expect(provider.calls).toHaveLength(1)
  expect(summary.calls).toHaveLength(1)
  expect(chunks.at(-1)).toMatchObject({ outcome: { type: "interrupt" }, type: EventType.RUN_FINISHED })
})

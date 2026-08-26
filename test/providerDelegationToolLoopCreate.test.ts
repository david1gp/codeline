import { expect, test } from "bun:test"
import { type AnyTextAdapter, EventType, type ModelMessage, type StreamChunk } from "@tanstack/ai"
import { providerDelegationToolLoopCreate } from "../src/providers/runtime/providerDelegationToolLoopCreate.js"
import { providerExecutionEventFromStreamChunk } from "../src/providers/runtime/providerExecutionEventFromStreamChunk.js"
import { executionStreamEventNormalize } from "../src/stream/actions/executionStreamEventNormalize.js"

type ScriptedAdapter = {
  adapter: AnyTextAdapter
  calls: Array<Array<ModelMessage>>
}

function scriptedAdapterCreate(scripts: Array<Array<StreamChunk>>): ScriptedAdapter {
  const calls: Array<Array<ModelMessage>> = []
  let scriptIndex = 0
  const adapter = {
    kind: "text" as const,
    model: "scripted-model",
    name: "scripted",
    chatStream: (options: { messages: Array<ModelMessage> }) => {
      calls.push(options.messages)
      const script = scripts[scriptIndex] ?? []
      scriptIndex += 1
      return (async function* () {
        for (const chunk of script) yield chunk
      })()
    },
    structuredOutput: async () => ({ data: {}, rawText: "{}" }),
  } as unknown as AnyTextAdapter
  return { adapter, calls }
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
      timestamp: 2,
      toolCallId: "call-delegation-1",
      toolCallName: "delegate_task",
      toolName: "delegate_task",
      type: EventType.TOOL_CALL_START,
    },
    { delta: '{"task":"return first"}', timestamp: 3, toolCallId: "call-delegation-1", type: EventType.TOOL_CALL_ARGS },
    {
      timestamp: 4,
      toolCallId: "call-delegation-2",
      toolCallName: "delegate_task",
      toolName: "delegate_task",
      type: EventType.TOOL_CALL_START,
    },
    {
      delta: '{"task":"return second"}',
      timestamp: 5,
      toolCallId: "call-delegation-2",
      type: EventType.TOOL_CALL_ARGS,
    },
    {
      finishReason: "tool_calls",
      outcome: { type: "success" },
      runId: "run-delegation",
      threadId: "thread-delegation",
      timestamp: 6,
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

test("returns multiple delegated results in tool call order", async () => {
  const scripted = scriptedAdapterCreate([multipleDelegatedToolScript(), terminalOnlyScript()])
  const loop = providerDelegationToolLoopCreate({
    adapter: scripted.adapter,
    delegateTask: ({ task }) => (task === "return first" ? "first result" : "second result"),
  })

  const chunks = await collect(
    loop({
      messages: [{ content: "Delegate both tasks.", role: "user" }],
      runId: "run-delegation",
      signal: new AbortController().signal,
      threadId: "thread-delegation",
    }),
  )

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

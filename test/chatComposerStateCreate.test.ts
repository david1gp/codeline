import { expect, mock, test } from "bun:test"
import { EventType, type ModelMessage, type StreamChunk, type UIMessage } from "@tanstack/ai"
import type { ConnectConnectionAdapter, RunAgentInputContext } from "@tanstack/ai-client"
import { ChatClient } from "@tanstack/ai-client"
import { createRoot, createSignal } from "solid-js/dist/solid.js"

mock.module("solid-js", () => import("solid-js/dist/solid.js"))

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
}

function deferredCreate<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

type ChatOptions = {
  connection: ConnectConnectionAdapter
  onChunk?: (chunk: StreamChunk) => void
  onError?: (error: Error) => void
  onErrorChange?: (error: Error | undefined) => void
  onLoadingChange?: (isLoading: boolean) => void
  onMessagesChange?: (messages: Array<UIMessage>) => void
  onRunIdChange?: (runId: string | null) => void
  queue?: "drop" | "interrupt" | "queue"
  threadId: string
}

const imported = await (async () => {
  let connection: ConnectConnectionAdapter | undefined
  let connectionFactory: ((connection: ConnectConnectionAdapter) => ConnectConnectionAdapter) | undefined
  let client: ChatClient | undefined

  mock.module("@tanstack/ai-solid", () => ({
    useChat: (options: ChatOptions) => {
      const [messages, setMessages] = createSignal<Array<UIMessage>>([])
      const [isLoading, setIsLoading] = createSignal(false)
      const [runId, setRunId] = createSignal<string | null>(null)
      const selectedConnection = connection ?? connectionFactory?.(options.connection) ?? options.connection
      client = new ChatClient({
        connection: selectedConnection,
        ...(options.queue === undefined ? {} : { queue: options.queue }),
        ...(options.onChunk === undefined ? {} : { onChunk: options.onChunk }),
        ...(options.onError === undefined ? {} : { onError: options.onError }),
        ...(options.onErrorChange === undefined ? {} : { onErrorChange: options.onErrorChange }),
        onLoadingChange: setIsLoading,
        onMessagesChange: setMessages,
        onRunIdChange: setRunId,
        threadId: options.threadId,
      })
      return {
        error: () => undefined,
        isLoading,
        messages,
        queue: () => client?.getQueue() ?? [],
        runId,
        sendMessage: (content: string, sendOptions?: { whenBusy?: "drop" | "interrupt" | "queue" }) =>
          client?.sendMessage(content, undefined, sendOptions) ?? Promise.resolve(),
        stop: () => client?.stop(),
      }
    },
  }))

  const imported = await import("../src/ui/chatComposerStateCreate.js")
  return {
    chatComposerStateCreate: imported.chatComposerStateCreate,
    client: () => client,
    setConnection: (next: ConnectConnectionAdapter | undefined) => {
      connection = next
    },
    setConnectionFactory: (next: ((connection: ConnectConnectionAdapter) => ConnectConnectionAdapter) | undefined) => {
      connectionFactory = next
    },
  }
})()

function textFromMessage(message: UIMessage | ModelMessage): string {
  if ("content" in message && typeof message.content === "string") return message.content
  if (!("parts" in message) || !Array.isArray(message.parts)) return ""
  return message.parts
    .filter(
      (part): part is { content: string; type: "text" } => part.type === "text" && typeof part.content === "string",
    )
    .map((part) => part.content)
    .join("")
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  })
}

function runStarted(runContext: RunAgentInputContext): StreamChunk {
  return {
    runId: runContext.runId,
    threadId: runContext.threadId,
    timestamp: 1,
    type: EventType.RUN_STARTED,
  }
}

function toolBatchChunks(
  runContext: RunAgentInputContext,
  releaseSecondResult: Promise<void>,
): AsyncIterable<StreamChunk> {
  return (async function* () {
    yield runStarted(runContext)
    yield {
      index: 0,
      timestamp: 2,
      toolCallId: "tool-1",
      toolCallName: "echo",
      toolName: "echo",
      type: EventType.TOOL_CALL_START,
    } as StreamChunk
    yield {
      delta: '{"value":"first"}',
      timestamp: 3,
      toolCallId: "tool-1",
      type: EventType.TOOL_CALL_ARGS,
    } as StreamChunk
    yield {
      timestamp: 4,
      toolCallId: "tool-1",
      toolName: "echo",
      type: EventType.TOOL_CALL_END,
    } as StreamChunk
    yield {
      index: 1,
      timestamp: 5,
      toolCallId: "tool-2",
      toolCallName: "echo",
      toolName: "echo",
      type: EventType.TOOL_CALL_START,
    } as StreamChunk
    yield {
      delta: '{"value":"second"}',
      timestamp: 6,
      toolCallId: "tool-2",
      type: EventType.TOOL_CALL_ARGS,
    } as StreamChunk
    yield {
      timestamp: 7,
      toolCallId: "tool-2",
      toolName: "echo",
      type: EventType.TOOL_CALL_END,
    } as StreamChunk
    yield {
      content: "first result",
      messageId: "assistant-tool-batch",
      timestamp: 8,
      toolCallId: "tool-1",
      type: EventType.TOOL_CALL_RESULT,
    } as StreamChunk
    await releaseSecondResult
    yield {
      content: "second result",
      messageId: "assistant-tool-batch",
      timestamp: 9,
      toolCallId: "tool-2",
      type: EventType.TOOL_CALL_RESULT,
    } as StreamChunk
    yield {
      finishReason: "stop",
      outcome: { type: "success" },
      runId: runContext.runId,
      threadId: runContext.threadId,
      timestamp: 10,
      type: EventType.RUN_FINISHED,
    } as StreamChunk
  })()
}

function nextRunChunks(runContext: RunAgentInputContext): AsyncIterable<StreamChunk> {
  return (async function* () {
    yield runStarted(runContext)
    yield {
      delta: "next response",
      messageId: "assistant-next-run",
      timestamp: 11,
      type: EventType.TEXT_MESSAGE_CONTENT,
    } as StreamChunk
    yield {
      finishReason: "stop",
      outcome: { type: "success" },
      runId: runContext.runId,
      threadId: runContext.threadId,
      timestamp: 12,
      type: EventType.RUN_FINISHED,
    } as StreamChunk
  })()
}

test("queues input until the current tool batch finishes and sends it in the next run context", async () => {
  const firstResultEmitted = deferredCreate<void>()
  const releaseSecondResult = deferredCreate<void>()
  const batchOrder: string[] = []
  const calls: Array<{ messages: Array<UIMessage> | Array<ModelMessage>; runContext: RunAgentInputContext }> = []
  const connection: ConnectConnectionAdapter = {
    connect(messages, _data, _signal, runContext) {
      if (runContext === undefined) throw new Error("run context is required")
      calls.push({ messages, runContext })
      if (calls.length === 1) {
        return (async function* () {
          const stream = toolBatchChunks(runContext, releaseSecondResult.promise)
          for await (const chunk of stream) {
            if (chunk.type === EventType.TOOL_CALL_RESULT && chunk.toolCallId === "tool-1") {
              batchOrder.push("first-result")
              firstResultEmitted.resolve(undefined)
            }
            if (chunk.type === EventType.TOOL_CALL_RESULT && chunk.toolCallId === "tool-2")
              batchOrder.push("second-result")
            yield chunk
          }
        })()
      }
      batchOrder.push("next-run-context")
      return nextRunChunks(runContext)
    },
  }
  imported.setConnection(connection)

  const root = createRoot((dispose) => ({
    dispose,
    state: imported.chatComposerStateCreate({ fetcher: async () => new Response(), sessionId: "session-1" }),
  }))

  root.state.setDraft("start")
  const firstSubmit = root.state.submit()
  await firstResultEmitted.promise
  expect(calls).toHaveLength(1)
  expect(root.state.isBusy()).toBe(true)
  expect(root.state.activity.attemptCount()).toBe(1)

  root.state.setDraft("queued input")
  await root.state.submit()
  expect(calls).toHaveLength(1)
  expect(
    imported
      .client()
      ?.getQueue()
      .map((message) => message.content),
  ).toEqual(["queued input"])
  expect(
    root.state
      .transientMessages()
      .filter((message) => message.role === "user")
      .map((message) => message.content),
  ).toEqual(["start"])
  expect(batchOrder).toEqual(["first-result"])
  expect(root.state.activity.attemptCount()).toBe(1)

  releaseSecondResult.resolve(undefined)
  await firstSubmit

  expect(batchOrder).toEqual(["first-result", "second-result", "next-run-context"])
  expect(imported.client()?.getQueue()).toEqual([])
  expect(calls[0]?.runContext.runId).not.toBe(calls[1]?.runContext.runId)
  expect(calls[0]?.messages.filter((message) => message.role === "user").map(textFromMessage)).toEqual(["start"])
  expect(calls[1]?.messages.filter((message) => message.role === "user").map(textFromMessage)).toEqual([
    "start",
    "queued input",
  ])

  root.dispose()
})

test("does not reuse command tokens after an error flushes later queued sends", async () => {
  imported.setConnection(undefined)

  const firstSnapshotRequested = deferredCreate<void>()
  const releaseFirstSnapshot = deferredCreate<void>()
  const requestBodies: Array<Record<string, unknown>> = []
  let postCount = 0
  let snapshotCount = 0
  let composerState!: ReturnType<typeof imported.chatComposerStateCreate>
  let currentCommand: { arguments: string; name: string } | undefined
  let lateSubmit: Promise<void> | undefined
  let errorObserved = false

  imported.setConnectionFactory((base) => ({
    connect(messages, data, signal, runContext) {
      const stream = base.connect(messages, data, signal, runContext)
      return (async function* () {
        for await (const chunk of stream) {
          yield chunk
          if (!errorObserved && chunk.type === EventType.RUN_ERROR) {
            errorObserved = true
            composerState.setDraft("/late")
            lateSubmit = composerState.submit()
          }
        }
      })()
    },
  }))

  const root = createRoot((dispose) => {
    composerState = imported.chatComposerStateCreate({
      command: {
        errorMessage: () => undefined,
        invocation: () => currentCommand,
      },
      fetcher: async (_input, init) => {
        if (init?.method === "POST") {
          postCount += 1
          requestBodies.push(JSON.parse(String(init.body)) as Record<string, unknown>)
          return jsonResponse({ runId: `run-${postCount}`, sessionId: "session-1" })
        }

        snapshotCount += 1
        if (snapshotCount === 1) {
          firstSnapshotRequested.resolve(undefined)
          await releaseFirstSnapshot.promise
          return jsonResponse({ lastSequence: 1, partialText: "", status: "failed" })
        }
        return jsonResponse({ lastSequence: 2, partialText: "", status: "succeeded" })
      },
      sessionId: "session-1",
    })
    return { dispose, state: composerState }
  })

  currentCommand = { arguments: "", name: "first" }
  root.state.setDraft("/first")
  const firstSubmit = root.state.submit()
  await firstSnapshotRequested.promise

  currentCommand = { arguments: "", name: "queued" }
  root.state.setDraft("/queued")
  await root.state.submit()
  expect(
    imported
      .client()
      ?.getQueue()
      .map((message) => message.content),
  ).toEqual(["/queued"])

  releaseFirstSnapshot.resolve(undefined)
  await firstSubmit
  const queuedAfterError = lateSubmit
  if (queuedAfterError === undefined) throw new Error("the error wrapper did not submit the late message")
  await queuedAfterError

  currentCommand = { arguments: "", name: "later" }
  root.state.setDraft("/later")
  await root.state.submit()

  expect(requestBodies.map((body) => body.command)).toEqual([
    { arguments: "", name: "first" },
    { arguments: "", name: "later" },
  ])

  root.dispose()
  imported.setConnectionFactory(undefined)
})

test("sends queued command invocations to provider requests in FIFO order", async () => {
  imported.setConnection(undefined)

  const firstSnapshotRequested = deferredCreate<void>()
  const releaseFirstSnapshot = deferredCreate<void>()
  const requestBodies: Array<Record<string, unknown>> = []
  let postCount = 0
  let snapshotCount = 0
  let currentCommand: { arguments: string; name: string } | undefined

  imported.setConnectionFactory((base) => ({
    connect(messages, data, signal, runContext) {
      return base.connect(messages, data, signal, runContext)
    },
  }))

  const root = createRoot((dispose) => ({
    dispose,
    state: imported.chatComposerStateCreate({
      command: {
        errorMessage: () => undefined,
        invocation: () => currentCommand,
      },
      fetcher: async (_input, init) => {
        if (init?.method === "POST") {
          postCount += 1
          requestBodies.push(JSON.parse(String(init.body)) as Record<string, unknown>)
          return jsonResponse({ runId: `run-${postCount}`, sessionId: "session-1" })
        }

        snapshotCount += 1
        if (snapshotCount === 1) {
          firstSnapshotRequested.resolve(undefined)
          await releaseFirstSnapshot.promise
        }
        return jsonResponse({ lastSequence: snapshotCount, partialText: "", status: "succeeded" })
      },
      sessionId: "session-1",
    }),
  }))

  currentCommand = { arguments: "first args", name: "first" }
  root.state.setDraft("/first")
  const firstSubmit = root.state.submit()
  await firstSnapshotRequested.promise

  currentCommand = { arguments: "second args", name: "second" }
  root.state.setDraft("/second")
  await root.state.submit()

  currentCommand = { arguments: "third args", name: "third" }
  root.state.setDraft("/third")
  await root.state.submit()

  expect(
    imported
      .client()
      ?.getQueue()
      .map((message) => message.content),
  ).toEqual(["/second", "/third"])

  releaseFirstSnapshot.resolve(undefined)
  await firstSubmit

  expect(requestBodies.map((body) => body.command)).toEqual([
    { arguments: "first args", name: "first" },
    { arguments: "second args", name: "second" },
    { arguments: "third args", name: "third" },
  ])
  expect(imported.client()?.getQueue()).toEqual([])

  root.dispose()
  imported.setConnectionFactory(undefined)
})

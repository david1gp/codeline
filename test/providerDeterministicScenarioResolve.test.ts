import { expect, test } from "bun:test"
import { EventType, type StreamChunk } from "@tanstack/ai"
import { providerDeterministicScenarioResolve } from "../src/providers/runtime/providerDeterministicScenarioResolve.js"
import { providerRuntimeAdapterCreate } from "../src/providers/runtime/providerRuntimeAdapterCreate.js"

async function collect(stream: AsyncIterable<StreamChunk>): Promise<Array<StreamChunk>> {
  const chunks: Array<StreamChunk> = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

function adapter(model: string) {
  return providerRuntimeAdapterCreate({
    configuration: { model, provider: "deterministic" },
    environment: {},
  })
}

function input(signal: AbortSignal, attemptOrdinal?: number) {
  return {
    history: [],
    prompt: "simulation prompt",
    runId: "simulation-run",
    sessionId: "simulation-session",
    signal,
    ...(attemptOrdinal === undefined ? {} : { attemptOrdinal }),
  }
}

test("deterministic scenario resolution accepts both configured prefixes and rejects unknown models", () => {
  expect(providerDeterministicScenarioResolve("simulation:streaming")).not.toBeNull()
  expect(providerDeterministicScenarioResolve("simulation-streaming")).not.toBeNull()
  expect(providerDeterministicScenarioResolve("simulation-unknown")).toBeNull()
  expect(providerDeterministicScenarioResolve("development-default")).toBeNull()
})

test("deterministic scenarios preserve chunk order and select the requested retry attempt", async () => {
  const streaming = await collect(adapter("simulation-streaming")(input(new AbortController().signal)))
  expect(streaming.map((chunk) => chunk.type)).toEqual([
    EventType.RUN_STARTED,
    EventType.TEXT_MESSAGE_START,
    EventType.TEXT_MESSAGE_CONTENT,
    EventType.TEXT_MESSAGE_CONTENT,
    EventType.TEXT_MESSAGE_END,
    EventType.RUN_FINISHED,
  ])
  expect(
    streaming
      .filter((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT)
      .map((chunk) => (chunk.type === EventType.TEXT_MESSAGE_CONTENT ? chunk.delta : ""))
      .join(""),
  ).toBe("The deterministic workspace check is streaming. No provider connection is required.")

  const thinkingTools = await collect(adapter("simulation-thinking-tools")(input(new AbortController().signal)))
  expect(thinkingTools.map((chunk) => chunk.type)).toEqual([
    EventType.RUN_STARTED,
    EventType.REASONING_START,
    EventType.TOOL_CALL_START,
    EventType.TOOL_CALL_END,
    EventType.TOOL_CALL_RESULT,
    EventType.TOOL_CALL_START,
    EventType.TOOL_CALL_END,
    EventType.TOOL_CALL_RESULT,
    EventType.REASONING_END,
    EventType.TEXT_MESSAGE_START,
    EventType.TEXT_MESSAGE_CONTENT,
    EventType.TEXT_MESSAGE_END,
    EventType.RUN_FINISHED,
  ])

  const retry = adapter("simulation-retry-success")
  const firstAttempt = await collect(retry(input(new AbortController().signal, 1)))
  const secondAttempt = await collect(retry(input(new AbortController().signal, 2)))
  expect(firstAttempt.map((chunk) => chunk.type)).toEqual([
    EventType.RUN_STARTED,
    EventType.TEXT_MESSAGE_START,
    EventType.TEXT_MESSAGE_CONTENT,
    EventType.RUN_ERROR,
  ])
  expect(secondAttempt.map((chunk) => chunk.type)).toEqual([
    EventType.RUN_STARTED,
    EventType.TEXT_MESSAGE_START,
    EventType.TEXT_MESSAGE_CONTENT,
    EventType.TEXT_MESSAGE_END,
    EventType.RUN_FINISHED,
  ])
  expect(firstAttempt.at(-1)).toMatchObject({ code: "provider_timeout", type: EventType.RUN_ERROR })
  expect(secondAttempt.at(-1)?.type).toBe(EventType.RUN_FINISHED)
})

test("deterministic cancellation stops before the delayed step can emit", async () => {
  const controller = new AbortController()
  const iterator = adapter("simulation-cancellation")(input(controller.signal))[Symbol.asyncIterator]()

  expect((await iterator.next()).value).toMatchObject({ type: EventType.RUN_STARTED })
  const delayed = iterator.next()
  controller.abort()

  expect(await delayed).toMatchObject({ done: true })
  expect(await iterator.next()).toMatchObject({ done: true })
})

import { expect, test } from "bun:test"
import { EventType, type StreamChunk } from "@tanstack/ai"
import { providerExecutionEventFromStreamChunk } from "../src/providers/runtime/providerExecutionEventFromStreamChunk.js"
import { providerDeterministicScenarioResolve } from "../src/providers/runtime/providerDeterministicScenarioResolve.js"
import { providerRuntimeAdapterCreate } from "../src/providers/runtime/providerRuntimeAdapterCreate.js"
import { executionTranscriptNormalize } from "../src/run/actions/executionTranscriptNormalize.js"
import { executionStreamEventNormalize } from "../src/stream/actions/executionStreamEventNormalize.js"

type TranscriptInput = Parameters<typeof executionTranscriptNormalize>[0]
type TranscriptEvent = TranscriptInput["events"][number]

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

async function collectTranscriptEvents(
  model: string,
  signal: AbortSignal,
  attemptOrdinal: number,
  streamId: string,
): Promise<Array<TranscriptEvent>> {
  const events: Array<TranscriptEvent> = []
  let sequence = 0
  for await (const chunk of adapter(model)(input(signal, attemptOrdinal))) {
    const providerEvent = providerExecutionEventFromStreamChunk(chunk)
    expect(providerEvent.success).toBe(true)
    if (!providerEvent.success || providerEvent.data === null) continue

    const normalizedEvent = executionStreamEventNormalize(providerEvent.data)
    expect(normalizedEvent.success).toBe(true)
    if (!normalizedEvent.success) continue

    events.push({ attemptOrdinal, event: normalizedEvent.data, sequence, streamId })
    sequence += 1
  }
  return events
}

function scenarioFixtureTranscriptEvents(model: string): Array<TranscriptEvent> {
  const scenario = providerDeterministicScenarioResolve(model)
  expect(scenario).not.toBeNull()
  if (scenario === null) return []

  // The provider adapter stops after its first terminal as a real stream should. Use the
  // normalized fixture seam here so late duplicate/out-of-order input remains observable.
  return scenario.attempts.flatMap((attempt) =>
    attempt.steps.map((step, sequence) => ({
      attemptOrdinal: attempt.ordinal,
      event: step.event,
      sequence,
      streamId: `${model}-${attempt.ordinal}`,
    })),
  )
}

test("deterministic scenario resolution accepts both configured prefixes and rejects unknown models", () => {
  expect(providerDeterministicScenarioResolve("simulation:streaming")).not.toBeNull()
  expect(providerDeterministicScenarioResolve("simulation-streaming")).not.toBeNull()
  expect(providerDeterministicScenarioResolve("simulation-unknown")).toBeNull()
  expect(providerDeterministicScenarioResolve("development-default")).toBeNull()
})

test("deterministic scenario resolution covers runtime stability cases", () => {
  for (const scenario of [
    "abort-before-event",
    "abort-event-race",
    "abort-after-terminal",
    "retry-stream-replacement",
    "incomplete-tool-lifecycle",
    "unexpected-end",
    "duplicate-terminal",
    "out-of-order-terminal",
  ]) {
    expect(providerDeterministicScenarioResolve(`simulation-${scenario}`)).not.toBeNull()
    expect(providerDeterministicScenarioResolve(`simulation:${scenario}`)).not.toBeNull()
  }
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

test("deterministic abort-before-event emits no provider chunks", async () => {
  const controller = new AbortController()
  controller.abort()

  expect(await collect(adapter("simulation-abort-before-event")(input(controller.signal)))).toEqual([])
})

test("deterministic abort/event race stops the pending event", async () => {
  const controller = new AbortController()
  const iterator = adapter("simulation-abort-event-race")(input(controller.signal))[Symbol.asyncIterator]()

  expect((await iterator.next()).value).toMatchObject({ type: EventType.RUN_STARTED })
  const pending = iterator.next()
  controller.abort()

  expect(await pending).toMatchObject({ done: true })
})

test("deterministic abort after terminal preserves the terminal chunk", async () => {
  const controller = new AbortController()
  const chunks = await collect(adapter("simulation-abort-after-terminal")(input(controller.signal)))
  controller.abort()

  expect(chunks.at(-1)?.type).toBe(EventType.RUN_FINISHED)
})

test("deterministic retry stream replacement isolates failed-attempt output", async () => {
  const retry = adapter("simulation-retry-stream-replacement")
  const firstAttempt = await collect(retry(input(new AbortController().signal, 1)))
  const secondAttempt = await collect(retry(input(new AbortController().signal, 2)))

  expect(firstAttempt.at(-1)).toMatchObject({ code: "provider_retryable", type: EventType.RUN_ERROR })
  expect(secondAttempt.map((chunk) => chunk.type)).toEqual([
    EventType.RUN_STARTED,
    EventType.TEXT_MESSAGE_START,
    EventType.TEXT_MESSAGE_CONTENT,
    EventType.TEXT_MESSAGE_END,
    EventType.RUN_FINISHED,
  ])
  expect(
    secondAttempt.some((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT && chunk.delta.includes("Failed")),
  ).toBe(false)
})

test("deterministic incomplete tool lifecycle ends without inventing a terminal", async () => {
  const chunks = await collect(adapter("simulation-incomplete-tool-lifecycle")(input(new AbortController().signal)))

  expect(chunks.map((chunk) => chunk.type)).toEqual([
    EventType.RUN_STARTED,
    EventType.TOOL_CALL_START,
    EventType.TOOL_CALL_END,
  ])
})

test("deterministic unexpected end emits no terminal chunk", async () => {
  const chunks = await collect(adapter("simulation-unexpected-end")(input(new AbortController().signal)))

  expect(chunks.map((chunk) => chunk.type)).toEqual([
    EventType.RUN_STARTED,
    EventType.TEXT_MESSAGE_START,
    EventType.TEXT_MESSAGE_CONTENT,
    EventType.TEXT_MESSAGE_CONTENT,
  ])
})

test("deterministic duplicate and out-of-order terminal input produce one terminal", async () => {
  const duplicate = await collect(adapter("simulation-duplicate-terminal")(input(new AbortController().signal)))
  const outOfOrder = await collect(adapter("simulation-out-of-order-terminal")(input(new AbortController().signal)))

  expect(duplicate.filter((chunk) => chunk.type === EventType.RUN_FINISHED)).toHaveLength(1)
  expect(outOfOrder.map((chunk) => chunk.type)).toEqual([EventType.RUN_STARTED, EventType.RUN_FINISHED])
})

test("deterministic incomplete and unexpected endings preserve semantic content and diagnose the missing terminal", async () => {
  const incomplete = executionTranscriptNormalize({
    attempts: [{ ordinal: 1, status: "running", streamId: "simulation-incomplete-tool-lifecycle-1" }],
    events: await collectTranscriptEvents(
      "simulation-incomplete-tool-lifecycle",
      new AbortController().signal,
      1,
      "simulation-incomplete-tool-lifecycle-1",
    ),
    streamEnded: true,
  })
  expect(incomplete.assistantText).toBe("")
  expect(incomplete.activities).toEqual([
    { kind: "tool", name: "read", phase: "started" },
    { content: '"Partial tool output."', kind: "tool", name: "read", phase: "output", truncated: false },
  ])
  expect(incomplete.terminalOutcome).toBeNull()
  expect(incomplete.invariantViolations).toEqual(["unexpected_stream_end", "incomplete_tool_lifecycle"])

  const unexpectedEnd = executionTranscriptNormalize({
    attempts: [{ ordinal: 1, status: "running", streamId: "simulation-unexpected-end-1" }],
    events: await collectTranscriptEvents(
      "simulation-unexpected-end",
      new AbortController().signal,
      1,
      "simulation-unexpected-end-1",
    ),
    streamEnded: true,
  })
  expect(unexpectedEnd.assistantText).toBe(
    "The deterministic stream started but ended early. No completion marker was emitted.",
  )
  expect(unexpectedEnd.activities).toEqual([])
  expect(unexpectedEnd.terminalOutcome).toBeNull()
  expect(unexpectedEnd.invariantViolations).toEqual(["unexpected_stream_end"])
})

test("deterministic retry stream replacement selects only the authoritative attempt", async () => {
  const firstAttempt = await collectTranscriptEvents(
    "simulation-retry-stream-replacement",
    new AbortController().signal,
    1,
    "simulation-retry-stream-replacement-1",
  )
  const secondAttempt = await collectTranscriptEvents(
    "simulation-retry-stream-replacement",
    new AbortController().signal,
    2,
    "simulation-retry-stream-replacement-2",
  )
  const transcript = executionTranscriptNormalize({
    attempts: [
      { ordinal: 1, status: "failed", streamId: "simulation-retry-stream-replacement-1" },
      { ordinal: 2, status: "succeeded", streamId: "simulation-retry-stream-replacement-2" },
    ],
    events: [...firstAttempt, ...secondAttempt],
  })

  expect(transcript.authoritativeAttemptOrdinal).toBe(2)
  expect(transcript.assistantText).toBe("Authoritative retry output.")
  expect(transcript.assistantText).not.toContain("Failed attempt")
  expect(transcript.terminalOutcome).toEqual({ status: "completed" })
  expect(transcript.attempts).toEqual([
    { ordinal: 1, status: "failed" },
    { ordinal: 2, status: "succeeded" },
  ])
  expect(transcript.invariantViolations).toEqual([])
})

test("deterministic duplicate and out-of-order terminal fixtures normalize to one canonical outcome", () => {
  const duplicate = executionTranscriptNormalize({
    attempts: [{ ordinal: 1, status: "succeeded", streamId: "simulation-duplicate-terminal-1" }],
    events: scenarioFixtureTranscriptEvents("simulation-duplicate-terminal"),
  })
  expect(duplicate.terminalOutcome).toEqual({ status: "completed" })
  expect(duplicate.invariantViolations).toEqual(["duplicate_terminal"])

  const outOfOrder = executionTranscriptNormalize({
    attempts: [{ ordinal: 1, status: "succeeded", streamId: "simulation-out-of-order-terminal-1" }],
    events: scenarioFixtureTranscriptEvents("simulation-out-of-order-terminal"),
  })
  expect(outOfOrder.assistantText).toBe("")
  expect(outOfOrder.terminalOutcome).toEqual({ status: "completed" })
  expect(outOfOrder.invariantViolations).toEqual(["event_after_terminal", "duplicate_terminal", "conflicting_terminal"])
})

test("deterministic abort races normalize cancellation without duplicate terminal outcomes", async () => {
  const beforeController = new AbortController()
  beforeController.abort()
  const before = executionTranscriptNormalize({
    attempts: [{ ordinal: 1, status: "aborted", streamId: "simulation-abort-before-event-1" }],
    events: await collectTranscriptEvents(
      "simulation-abort-before-event",
      beforeController.signal,
      1,
      "simulation-abort-before-event-1",
    ),
    run: { cancellationKind: "requested", status: "aborted" },
  })
  expect(before.assistantText).toBe("")
  expect(before.cancellation).toEqual({ kind: "requested" })
  expect(before.terminalOutcome).toEqual({ status: "aborted" })
  expect(before.invariantViolations).toEqual([])

  const raceController = new AbortController()
  const raceIterator = adapter("simulation-abort-event-race")(input(raceController.signal))[Symbol.asyncIterator]()
  expect((await raceIterator.next()).value).toMatchObject({ type: EventType.RUN_STARTED })
  const pending = raceIterator.next()
  raceController.abort()
  expect(await pending).toMatchObject({ done: true })
  const race = executionTranscriptNormalize({
    attempts: [{ ordinal: 1, status: "aborted", streamId: "simulation-abort-event-race-1" }],
    events: [],
    run: { cancellationKind: "requested", status: "aborted" },
  })
  expect(race.assistantText).toBe("")
  expect(race.terminalOutcome).toEqual({ status: "aborted" })
  expect(race.invariantViolations).toEqual([])

  const after = executionTranscriptNormalize({
    attempts: [{ ordinal: 1, status: "succeeded", streamId: "simulation-abort-after-terminal-1" }],
    events: await collectTranscriptEvents(
      "simulation-abort-after-terminal",
      new AbortController().signal,
      1,
      "simulation-abort-after-terminal-1",
    ),
    run: { status: "succeeded" },
  })
  expect(after.assistantText).toBe("The terminal event wins before abort.")
  expect(after.terminalOutcome).toEqual({ status: "completed" })
  expect(after.cancellation).toBeNull()
  expect(after.invariantViolations).toEqual([])
})

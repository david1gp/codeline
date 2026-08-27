import { expect, test } from "bun:test"
import { createResult } from "@adaptive-ds/result"
import * as v from "valibot"
import { commandExpand } from "../src/commands/actions/commandExpand.js"
import { commandShellInterpolationResolve } from "../src/commands/actions/commandShellInterpolationResolve.js"
import { commandMessageMetadataSchema } from "../src/commands/schema/commandMessageMetadataSchema.js"
import { providerDeterministicScenarioFixture } from "../src/providers/runtime/providerDeterministicScenarioFixture.js"
import { executionTranscriptNormalize } from "../src/run/actions/executionTranscriptNormalize.js"
import { executionTranscriptProject } from "../src/run/actions/executionTranscriptProject.js"
import type { ExecutionStreamEvent } from "../src/stream/schema/executionStreamEventSchema.js"
import type { StreamProducerDelta } from "../src/stream/schema/streamProducerDeltaSchema.js"
import { bashToolCreate } from "../src/tools/runtime/bashToolCreate.js"
import { toolRegistryCreate } from "../src/tools/runtime/toolRegistryCreate.js"

type TranscriptInput = Parameters<typeof executionTranscriptNormalize>[0]
type TranscriptEvent = TranscriptInput["events"][number]
type ProjectInput = Parameters<typeof executionTranscriptProject>[0]
type ProjectEvent = NonNullable<ProjectInput["events"]>[number]

const streamId = "semantic-stream"
const runId = "semantic-run"
const sessionId = "semantic-session"

function liveEvents(
  events: readonly ExecutionStreamEvent[],
  attemptOrdinal = 1,
  eventStreamId = streamId,
  startSequence = 0,
): Array<TranscriptEvent> {
  return events.map((event, index) => ({
    attemptOrdinal,
    event,
    sequence: startSequence + index,
    streamId: eventStreamId,
  }))
}

function durableDelta(event: ExecutionStreamEvent): StreamProducerDelta | undefined {
  if (event.eventType === "terminal") return undefined
  if (event.eventType === "text_delta")
    return { delta: event.payload.delta, deltaKind: "text", messageId: null, runId, sessionId }
  if (event.eventType === "thinking_status")
    return { delta: event.payload.status, deltaKind: "thinking", messageId: null, runId, sessionId }
  if (event.eventType === "tool_start")
    return { delta: JSON.stringify(event.payload), deltaKind: "tool", messageId: null, runId, sessionId }
  if (event.eventType === "tool_output")
    return { delta: JSON.stringify(event.payload), deltaKind: "tool", messageId: null, runId, sessionId }
  if (event.eventType === "tool_result")
    return { delta: JSON.stringify(event.payload), deltaKind: "tool", messageId: null, runId, sessionId }
  return undefined
}

function journalEvents(
  events: readonly ExecutionStreamEvent[],
  startSequence = 1,
  attemptOrdinal = 1,
  eventStreamId = streamId,
): Array<ProjectEvent> {
  return events.flatMap<ProjectEvent>((event, index): Array<ProjectEvent> => {
    const sequence = startSequence + index
    if (event.eventType === "terminal") {
      if (event.payload.status === "completed")
        return [
          {
            attemptOrdinal,
            event: {
              eventType: "run-completed" as const,
              payload: { messageId: null, runId, sessionId, sessionRevision: 1 },
            },
            sequence,
            streamId: eventStreamId,
          },
        ]
      if (event.payload.status === "aborted")
        return [
          {
            attemptOrdinal,
            event: {
              eventType: "run-cancelled" as const,
              payload: { runId, sessionId, sessionRevision: 1 },
            },
            sequence,
            streamId: eventStreamId,
          },
        ]
      return [
        {
          attemptOrdinal,
          event: {
            eventType: "run-failed" as const,
            payload: {
              failure: {
                code: event.payload.code ?? "provider_failed",
                message: event.payload.message ?? "The provider failed.",
              },
              runId,
              sessionId,
              sessionRevision: 1,
            },
          },
          sequence,
          streamId: eventStreamId,
        },
      ]
    }
    const delta = durableDelta(event)
    if (delta === undefined) return []
    return [
      { attemptOrdinal, event: { eventType: "delta" as const, payload: delta }, sequence, streamId: eventStreamId },
    ]
  })
}

function runningAttempt() {
  return [{ ordinal: 1, status: "running" as const, streamId }]
}

function succeededAttempt() {
  return [{ ordinal: 1, status: "succeeded" as const, streamId }]
}

function transcriptStableState(transcript: ReturnType<typeof executionTranscriptNormalize>) {
  return {
    activities: transcript.activities,
    assistantText: transcript.assistantText,
    cancellation: transcript.cancellation,
    failure: transcript.failure,
    terminalOutcome: transcript.terminalOutcome,
  }
}

test("projects live and pre-reload streaming text to one normalized transcript", () => {
  const fixture = providerDeterministicScenarioFixture.streaming.attempts[0]
  if (fixture === undefined) return
  const events = fixture.steps.map((step) => step.event)
  const live = executionTranscriptProject({
    attempts: succeededAttempt(),
    events: liveEvents(events),
    run: { status: "succeeded" },
  })
  const persisted = executionTranscriptProject({ attempts: succeededAttempt(), events: journalEvents(events) })

  expect(transcriptStableState(persisted)).toEqual(transcriptStableState(live))
  expect(live.assistantText).toBe("The deterministic workspace check is streaming. No provider connection is required.")
  expect(live.terminalOutcome).toEqual({ status: "completed" })
})

test("projects retry attempts consistently and excludes the failed attempt at handoff and finalization", () => {
  const fixture = providerDeterministicScenarioFixture["retry-success"]
  const firstAttempt = fixture.attempts[0]
  const secondAttempt = fixture.attempts[1]
  if (firstAttempt === undefined || secondAttempt === undefined) return
  const firstEvents = firstAttempt.steps.map((step) => step.event)
  const secondEvents = secondAttempt.steps.map((step) => step.event)
  const attempts = [
    { ordinal: 1, status: "failed" as const, streamId: "retry-stream-1" },
    { ordinal: 2, status: "succeeded" as const, streamId: "retry-stream-2" },
  ]

  const live = executionTranscriptProject({
    attempts,
    events: [
      ...liveEvents(firstEvents, 1, "retry-stream-1"),
      ...liveEvents(secondEvents, 2, "retry-stream-2", firstEvents.length),
    ],
    run: { status: "succeeded" },
  })
  const persisted = executionTranscriptProject({
    attempts,
    events: [
      ...journalEvents(firstEvents, 1, 1, "retry-stream-1"),
      ...journalEvents(secondEvents, firstEvents.length + 1, 2, "retry-stream-2"),
    ],
    run: { status: "succeeded" },
  })

  expect(transcriptStableState(persisted)).toEqual(transcriptStableState(live))
  expect(live.authoritativeAttemptOrdinal).toBe(2)
  expect(live.assistantText).toBe("The retry completed successfully.")
  expect(live.attempts).toEqual([
    { ordinal: 1, status: "failed" },
    { ordinal: 2, status: "succeeded" },
  ])

  const handoff = executionTranscriptProject({
    activeSnapshot: {
      lastSequence: firstEvents.length + 1,
      partialText: "The retry completed successfully.",
      status: "succeeded",
    },
    attempts: [
      { ordinal: 1, status: "failed", streamId: "retry-stream-1" },
      { ordinal: 2, status: "succeeded", streamId: "retry-stream-2" },
    ],
    backlog: journalEvents([secondEvents.at(-1) as ExecutionStreamEvent], firstEvents.length + 2, 2, "retry-stream-2"),
    events: journalEvents(firstEvents, 1, 1, "retry-stream-1"),
  })
  const uninterrupted = executionTranscriptProject({
    attempts: [{ ordinal: 2, status: "succeeded", streamId: "retry-stream-2" }],
    events: liveEvents(secondEvents, 2, "retry-stream-2"),
    run: { status: "succeeded" },
  })

  expect(transcriptStableState(handoff)).toEqual(transcriptStableState(uninterrupted))
  expect(handoff.assistantText).toBe("The retry completed successfully.")
  expect(handoff.invariantViolations).toEqual([])

  const finalized = executionTranscriptProject({
    attempts,
    events: journalEvents([secondEvents.at(-1) as ExecutionStreamEvent], 1, 2, "retry-stream-2"),
    finalizedAssistantText: "The retry completed successfully.",
    run: { status: "succeeded" },
  })
  expect(finalized.assistantText).toBe(live.assistantText)
  expect(finalized.terminalOutcome).toEqual(live.terminalOutcome)
  expect(finalized.invariantViolations).toEqual([])
})

test("projects an active snapshot and only newer SSE backlog without duplicating streaming text", () => {
  const fixture = providerDeterministicScenarioFixture.streaming.attempts[0]
  if (fixture === undefined) return
  const events = fixture.steps.map((step) => step.event)
  const backlog = journalEvents(events.slice(1, 2), 2)
  const handoff = executionTranscriptProject({
    activeSnapshot: {
      lastSequence: 1,
      partialText: "The deterministic workspace check is streaming. ",
      status: "running",
    },
    attempts: runningAttempt(),
    backlog,
  })
  const uninterrupted = executionTranscriptProject({
    attempts: runningAttempt(),
    events: liveEvents(events.slice(0, 2)),
    run: { status: "running" },
  })

  expect(transcriptStableState(handoff)).toEqual(transcriptStableState(uninterrupted))
  expect(handoff.assistantText).toBe(
    "The deterministic workspace check is streaming. No provider connection is required.",
  )
  expect(handoff.terminalOutcome).toBeNull()
})

test("projects thinking and tool journal deltas to the same lifecycle transcript as live events", () => {
  const fixture = providerDeterministicScenarioFixture["thinking-tools"].attempts[0]
  if (fixture === undefined) return
  const events = fixture.steps.map((step) => step.event)
  const live = executionTranscriptProject({
    attempts: succeededAttempt(),
    events: liveEvents(events),
    run: { status: "succeeded" },
  })
  const persisted = executionTranscriptProject({ attempts: succeededAttempt(), events: journalEvents(events) })

  expect(transcriptStableState(persisted)).toEqual(transcriptStableState(live))
  expect(live.activities).toEqual([
    { kind: "thinking", phase: "started" },
    { kind: "tool", name: "read", phase: "started" },
    {
      content: "src/providers/runtime/providerRuntimeAdapterCreate.ts",
      kind: "tool",
      name: "read",
      phase: "output",
      truncated: false,
    },
    {
      content: "Read a checked-in runtime path.",
      kind: "tool",
      name: "read",
      outcome: "success",
      phase: "result",
      truncated: false,
    },
    { kind: "tool", name: "glob", phase: "started" },
    { content: "src/providers/runtime/*Scenario*", kind: "tool", name: "glob", phase: "output", truncated: false },
    {
      content: "Found the provider-owned deterministic scenario fixture.",
      kind: "tool",
      name: "glob",
      outcome: "success",
      phase: "result",
      truncated: false,
    },
    { kind: "thinking", phase: "finished" },
  ])
  expect(live.assistantText).toBe("Discovery stayed synthetic and provider-free.")
})

test("projects thinking and tool state across an active snapshot and SSE backlog", () => {
  const fixture = providerDeterministicScenarioFixture["thinking-tools"].attempts[0]
  if (fixture === undefined) return
  const events = fixture.steps.map((step) => step.event)
  const backlog = journalEvents(events.slice(4, 9), 5)
  const duplicateBacklogEvent = backlog[0]
  const handoff = executionTranscriptProject({
    activeSnapshot: { lastSequence: 4, partialText: "", status: "running" },
    attempts: runningAttempt(),
    backlog: duplicateBacklogEvent === undefined ? backlog : [...backlog, duplicateBacklogEvent],
    events: journalEvents(events.slice(0, 4)),
  })
  const uninterrupted = executionTranscriptProject({
    attempts: runningAttempt(),
    events: liveEvents(events.slice(0, 9)),
    run: { status: "running" },
  })

  expect(transcriptStableState(handoff)).toEqual(transcriptStableState(uninterrupted))
  expect(handoff.invariantViolations).toEqual([])
})

test("projects cancellation after partial output consistently through handoff and finalization", () => {
  const fixture = providerDeterministicScenarioFixture.cancellation
  const activeEvents = fixture.attempts[0]?.steps.slice(0, 2).map((step) => step.event)
  if (activeEvents === undefined) return
  const cancelledEvent: ExecutionStreamEvent = { eventType: "terminal", payload: { status: "aborted" } }
  const events = [...activeEvents, cancelledEvent]
  const attempts = [{ ordinal: 1, status: "aborted" as const, streamId }]

  const live = executionTranscriptProject({
    attempts,
    events: liveEvents(events),
    run: { status: "aborted" },
  })
  const persisted = executionTranscriptProject({
    attempts,
    events: journalEvents(events),
    run: { status: "aborted" },
  })

  expect(transcriptStableState(persisted)).toEqual(transcriptStableState(live))
  expect(live.assistantText).toBe("")
  expect(live.cancellation).toEqual({})
  expect(live.terminalOutcome).toEqual({ status: "aborted" })

  const handoff = executionTranscriptProject({
    activeSnapshot: {
      lastSequence: 2,
      partialText: "The cancellable deterministic run is active. ",
      status: "aborted",
    },
    attempts,
    backlog: journalEvents([cancelledEvent], 3),
    events: journalEvents(activeEvents),
  })
  const finalized = executionTranscriptProject({
    attempts,
    events: journalEvents([cancelledEvent]),
    finalizedAssistantText: "This text must not survive cancellation.",
    run: { status: "aborted" },
  })

  expect(transcriptStableState(handoff)).toEqual(transcriptStableState(live))
  expect(finalized.assistantText).toBe(live.assistantText)
  expect(finalized.cancellation).toEqual(live.cancellation)
  expect(finalized.failure).toEqual(live.failure)
  expect(finalized.terminalOutcome).toEqual(live.terminalOutcome)
  expect(finalized.activities).toEqual([])
  expect(handoff.invariantViolations).toEqual([])
  expect(finalized.invariantViolations).toEqual([])
})

test("projects bash and webfetch lifecycle payloads consistently through live state, handoff, and finalization", () => {
  const fixture = providerDeterministicScenarioFixture["bash-webfetch"]
  const attempt = fixture.attempts[0]
  if (attempt === undefined) return
  const events = attempt.steps.map((step) => step.event)
  const live = executionTranscriptProject({
    attempts: succeededAttempt(),
    events: liveEvents(events),
    run: { status: "succeeded" },
  })
  const persisted = executionTranscriptProject({ attempts: succeededAttempt(), events: journalEvents(events) })

  expect(transcriptStableState(persisted)).toEqual(transcriptStableState(live))
  expect(live.activities).toEqual([
    { kind: "thinking", phase: "started" },
    { kind: "tool", name: "bash", phase: "started" },
    {
      content: JSON.stringify({ command: "printf workspace-ok", workingDirectory: "src" }),
      kind: "tool",
      name: "bash",
      phase: "output",
      truncated: false,
    },
    {
      content: JSON.stringify({
        exitCode: 0,
        stderr: "",
        stdout: "workspace-ok\n",
        truncated: false,
        workingDirectory: "src",
      }),
      kind: "tool",
      name: "bash",
      outcome: "success",
      phase: "result",
      truncated: false,
    },
    { kind: "tool", name: "webfetch", phase: "started" },
    {
      content: JSON.stringify({ format: "markdown", url: "https://example.test/docs" }),
      kind: "tool",
      name: "webfetch",
      phase: "output",
      truncated: false,
    },
    {
      content: JSON.stringify({
        contentType: "text/html",
        format: "markdown",
        output: "# Deterministic docs\n\nFetched content.",
        truncated: false,
        url: "https://example.test/docs",
      }),
      kind: "tool",
      name: "webfetch",
      outcome: "success",
      phase: "result",
      truncated: false,
    },
    { kind: "thinking", phase: "finished" },
  ])

  const handoff = executionTranscriptProject({
    activeSnapshot: { lastSequence: 4, partialText: "", status: "running" },
    attempts: runningAttempt(),
    backlog: journalEvents(events.slice(4, 9), 5),
    events: journalEvents(events.slice(0, 4)),
  })
  const uninterrupted = executionTranscriptProject({
    attempts: runningAttempt(),
    events: liveEvents(events.slice(0, 9)),
    run: { status: "running" },
  })
  expect(transcriptStableState(handoff)).toEqual(transcriptStableState(uninterrupted))
  expect(handoff.invariantViolations).toEqual([])

  const finalized = executionTranscriptProject({
    attempts: succeededAttempt(),
    events: journalEvents([events.at(-1) as ExecutionStreamEvent]),
    finalizedAssistantText: "The command tools returned deterministic results.",
    run: { status: "succeeded" },
  })
  expect(finalized.assistantText).toBe(live.assistantText)
  expect(finalized.terminalOutcome).toEqual(live.terminalOutcome)
  expect(finalized.activities).toEqual([])
})

test("projects the response for an expanded command while retaining interpolation metadata", async () => {
  const digest = `sha256-${"a".repeat(64)}`
  const command = {
    body: "Review $1 and !`printf docs`.",
    canonicalPath: "/project/.agents/commands/review.md",
    digest,
    name: "review",
    precedence: 1,
    relativePath: "review.md",
    size: "Review $1 and !`printf docs`.".length,
    source: "project" as const,
    templateDigest: digest,
  }
  const expanded = commandExpand({ arguments: "runtime", catalogDigest: digest, command })
  expect(expanded.success).toBe(true)
  if (!expanded.success) return

  const registry = toolRegistryCreate()
  const registered = registry.register({
    ...bashToolCreate({
      execute: async (input, options) => {
        expect(input.command).toBe("printf docs")
        expect(options.projectRoot).toBe("/project")
        return createResult({
          exitCode: 0,
          stderr: "",
          stdout: "docs\n",
          truncated: false,
          workingDirectory: "/project",
        })
      },
      projectRoot: "/project",
    }),
    enabled: true,
  })
  expect(registered.success).toBe(true)
  if (!registered.success) return
  const interpolated = await commandShellInterpolationResolve(expanded.data.expandedText, {
    registry,
    signal: new AbortController().signal,
    workingDirectory: "/project",
  })
  expect(interpolated).toMatchObject({ success: true, data: "Review runtime and docs." })
  if (!interpolated.success) return

  const metadata = v.safeParse(commandMessageMetadataSchema, {
    command: {
      argumentsText: expanded.data.argumentsText,
      catalogDigest: digest,
      expandedUserText: interpolated.data,
      name: expanded.data.commandName,
      overrides: expanded.data.overrides,
      templateDigest: expanded.data.templateDigest,
      version: 1,
    },
  })
  expect(metadata.success).toBe(true)
  if (!metadata.success) return
  expect(metadata.output.command).toEqual({
    argumentsText: "runtime",
    catalogDigest: digest,
    expandedUserText: "Review runtime and docs.",
    name: "review",
    overrides: {},
    templateDigest: digest,
    version: 1,
  })

  const responseEvents: ExecutionStreamEvent[] = [
    { eventType: "text_delta", payload: { delta: "The expanded command was handled deterministically." } },
    { eventType: "terminal", payload: { status: "completed" } },
  ]
  const live = executionTranscriptProject({
    attempts: succeededAttempt(),
    events: liveEvents(responseEvents),
    run: { status: "succeeded" },
  })
  const handoff = executionTranscriptProject({
    activeSnapshot: { lastSequence: 0, partialText: "", status: "running" },
    attempts: runningAttempt(),
    backlog: journalEvents(responseEvents),
  })
  const finalized = executionTranscriptProject({
    attempts: succeededAttempt(),
    events: journalEvents([responseEvents[1] as ExecutionStreamEvent]),
    finalizedAssistantText: "The expanded command was handled deterministically.",
    run: { status: "succeeded" },
  })

  expect(transcriptStableState(handoff)).toEqual(
    transcriptStableState(
      executionTranscriptProject({
        attempts: runningAttempt(),
        events: liveEvents(responseEvents),
        run: { status: "running" },
      }),
    ),
  )
  expect(live.assistantText).toBe("The expanded command was handled deterministically.")
  expect(finalized.assistantText).toBe(live.assistantText)
  expect(finalized.terminalOutcome).toEqual(live.terminalOutcome)
})

test("uses finalized assistant text and terminal state after journal delta compaction", () => {
  const fixture = providerDeterministicScenarioFixture.streaming.attempts[0]
  if (fixture === undefined) return
  const events = fixture.steps.map((step) => step.event)
  const finalized = executionTranscriptProject({
    attempts: succeededAttempt(),
    events: journalEvents([events[2] as ExecutionStreamEvent]),
    finalizedAssistantText: "The deterministic workspace check is streaming. No provider connection is required.",
    run: { status: "succeeded" },
  })
  expect(finalized).toMatchObject({
    activities: [],
    assistantText: "The deterministic workspace check is streaming. No provider connection is required.",
    terminalOutcome: { status: "completed" },
  })
})

test("keeps finalized thinking and tool state terminal-only after compacting lifecycle deltas", () => {
  const fixture = providerDeterministicScenarioFixture["thinking-tools"].attempts[0]
  if (fixture === undefined) return
  const events = fixture.steps.map((step) => step.event)
  const finalized = executionTranscriptProject({
    attempts: succeededAttempt(),
    events: journalEvents([events.at(-1) as ExecutionStreamEvent]),
    finalizedAssistantText: "Discovery stayed synthetic and provider-free.",
    run: { status: "succeeded" },
  })

  expect(finalized).toMatchObject({
    activities: [],
    assistantText: "Discovery stayed synthetic and provider-free.",
    terminalOutcome: { status: "completed" },
  })
  expect(finalized.invariantViolations).toEqual([])
})

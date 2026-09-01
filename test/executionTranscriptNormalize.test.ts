import { expect, test } from "bun:test"
import { executionTranscriptNormalize } from "../src/run/actions/executionTranscriptNormalize.js"

type Input = Parameters<typeof executionTranscriptNormalize>[0]
type Event = Input["events"][number]

function event(input: Event): Event {
  return input
}

function normalize(input: Partial<Input> & Pick<Input, "events">) {
  return executionTranscriptNormalize(input)
}

test("selects the latest attempt and excludes failed-attempt text from the semantic transcript", () => {
  const transcript = normalize({
    attempts: [
      { ordinal: 1, status: "failed", streamId: "attempt-1" },
      { ordinal: 2, status: "succeeded", streamId: "attempt-2" },
    ],
    events: [
      event({
        attemptOrdinal: 1,
        event: { eventType: "text_delta", payload: { delta: "failed text" } },
        streamId: "attempt-1",
      }),
      event({
        attemptOrdinal: 1,
        event: { eventType: "terminal", payload: { status: "error" } },
        streamId: "attempt-1",
      }),
      event({
        attemptOrdinal: 2,
        event: { eventType: "text_delta", payload: { delta: "retry text" } },
        streamId: "attempt-2",
      }),
      event({
        attemptOrdinal: 2,
        event: { eventType: "terminal", payload: { status: "completed" } },
        streamId: "attempt-2",
      }),
    ],
  })

  expect(transcript.authoritativeAttemptOrdinal).toBe(2)
  expect(transcript.assistantText).toBe("retry text")
  expect(transcript.attempts).toEqual([
    { ordinal: 1, status: "failed" },
    { ordinal: 2, status: "succeeded" },
  ])
})

test("isolates the authoritative stream when retry and stray stream events are interleaved", () => {
  const transcript = normalize({
    attempts: [
      { ordinal: 1, status: "failed", streamId: "old-stream" },
      { ordinal: 2, status: "running", streamId: "authoritative-stream" },
    ],
    events: [
      event({
        attemptOrdinal: 2,
        event: { eventType: "text_delta", payload: { delta: "wrong stream" } },
        streamId: "other-stream",
      }),
      event({
        attemptOrdinal: 1,
        event: { eventType: "text_delta", payload: { delta: "old attempt" } },
        streamId: "old-stream",
      }),
      event({
        attemptOrdinal: 2,
        event: { eventType: "text_delta", payload: { delta: "authoritative" } },
        streamId: "authoritative-stream",
      }),
    ],
  })

  expect(transcript.assistantText).toBe("authoritative")
  expect(transcript.authoritativeAttemptOrdinal).toBe(2)
  expect(transcript.invariantViolations).toEqual(["stream_isolation"])
})

test("folds thinking and tool lifecycle events without leaking them into assistant text or retaining IDs", () => {
  const transcript = normalize({
    events: [
      event({
        attemptOrdinal: 1,
        event: { eventType: "thinking_status", payload: { status: "started" } },
        streamId: "stream",
      }),
      event({
        attemptOrdinal: 1,
        event: { eventType: "tool_start", payload: { toolCallId: "call-secret", toolName: "read" } },
        streamId: "stream",
      }),
      event({
        attemptOrdinal: 1,
        event: {
          eventType: "tool_output",
          payload: { output: "tool output", toolCallId: "call-secret", truncated: false },
        },
        streamId: "stream",
      }),
      event({
        attemptOrdinal: 1,
        event: {
          eventType: "tool_result",
          payload: { outcome: "success", result: "tool result", toolCallId: "call-secret", truncated: false },
        },
        streamId: "stream",
      }),
      event({
        attemptOrdinal: 1,
        event: { eventType: "thinking_status", payload: { status: "finished" } },
        streamId: "stream",
      }),
      event({
        attemptOrdinal: 1,
        event: { eventType: "text_delta", payload: { delta: "assistant" } },
        streamId: "stream",
      }),
    ],
  })

  expect(transcript.assistantText).toBe("assistant")
  expect(transcript.activities).toEqual([
    { kind: "thinking", phase: "started" },
    { kind: "tool", name: "read", phase: "started" },
    { content: "tool output", kind: "tool", name: "read", phase: "output", truncated: false },
    { content: "tool result", kind: "tool", name: "read", outcome: "success", phase: "result", truncated: false },
    { kind: "thinking", phase: "finished" },
  ])
  expect(JSON.stringify(transcript)).not.toContain("call-secret")
})

test("maps normalized run deltas and terminal events to stable outcome, cancellation, and failure state", () => {
  const cancelled = normalize({
    events: [
      event({
        attemptOrdinal: 1,
        event: { delta: "thinking text", deltaKind: "thinking", messageId: null, runId: "run", sessionId: "session" },
        streamId: "stream",
      }),
      event({
        attemptOrdinal: 1,
        event: { delta: " continued", deltaKind: "thinking", messageId: null, runId: "run", sessionId: "session" },
        streamId: "stream",
      }),
      event({
        attemptOrdinal: 1,
        event: { delta: "tool text", deltaKind: "tool", messageId: null, runId: "run", sessionId: "session" },
        streamId: "stream",
      }),
      event({
        attemptOrdinal: 1,
        event: { delta: " continued", deltaKind: "tool", messageId: null, runId: "run", sessionId: "session" },
        streamId: "stream",
      }),
      event({
        attemptOrdinal: 1,
        event: {
          changePosition: 3,
          eventType: "run-cancelled",
          id: "event-id",
          reason: "user-requested",
          runId: "run",
          sequence: 3,
          sessionId: "session",
          sessionRevision: 1,
        },
        streamId: "stream",
      }),
    ],
    run: { cancellationKind: "requested", status: "aborted" },
  })
  expect(cancelled.assistantText).toBe("")
  expect(cancelled.activities).toEqual([
    { content: "thinking text continued", kind: "thinking", phase: "delta" },
    { content: "tool text continued", kind: "tool", phase: "delta" },
  ])
  expect(cancelled.cancellation).toEqual({ kind: "requested", reason: "user-requested" })
  expect(cancelled.terminalOutcome).toEqual({ reason: "user-requested", status: "aborted" })

  const failed = normalize({
    events: [
      event({
        attemptOrdinal: 1,
        event: {
          eventType: "run-failed",
          payload: {
            failure: { code: "provider_failed", message: "The provider failed." },
            runId: "run",
            sessionId: "session",
            sessionRevision: 1,
          },
        },
        streamId: "stream",
      }),
    ],
  })
  expect(failed.failure).toEqual({ code: "provider_failed", message: "The provider failed." })
  expect(failed.terminalOutcome).toEqual({
    failure: { code: "provider_failed", message: "The provider failed." },
    status: "failed",
  })
})

test("uses the durable run status as a terminal fallback when no terminal event is present", () => {
  const transcript = normalize({
    events: [],
    run: {
      failure: { code: "provider_failed", message: "The provider failed." },
      status: "failed",
    },
  })

  expect(transcript.terminalOutcome).toEqual({
    failure: { code: "provider_failed", message: "The provider failed." },
    status: "failed",
  })
  expect(transcript.failure).toEqual({ code: "provider_failed", message: "The provider failed." })
})

test("keeps the first terminal in canonical order and reports duplicate or conflicting terminals", () => {
  const transcript = normalize({
    events: [
      event({
        attemptOrdinal: 1,
        event: { eventType: "terminal", payload: { status: "completed" } },
        sequence: 2,
        streamId: "stream",
      }),
      event({
        attemptOrdinal: 1,
        event: {
          eventType: "terminal",
          payload: { code: "late-error", message: "late", status: "error" },
        },
        sequence: 3,
        streamId: "stream",
      }),
      event({
        attemptOrdinal: 1,
        event: { eventType: "terminal", payload: { status: "aborted" } },
        sequence: 1,
        streamId: "stream",
      }),
    ],
  })

  expect(transcript.terminalOutcome).toEqual({ status: "aborted" })
  expect(transcript.invariantViolations).toEqual(["duplicate_terminal", "conflicting_terminal"])
})

test("does not append text after a terminal and retains no text for a failed authoritative attempt", () => {
  const transcript = normalize({
    attempts: [{ ordinal: 1, status: "failed", streamId: "stream" }],
    events: [
      event({
        attemptOrdinal: 1,
        event: { eventType: "terminal", payload: { status: "error" } },
        streamId: "stream",
      }),
      event({
        attemptOrdinal: 1,
        event: { eventType: "text_delta", payload: { delta: "must not leak" } },
        streamId: "stream",
      }),
    ],
  })

  expect(transcript.assistantText).toBe("")
  expect(transcript.invariantViolations).toContain("event_after_terminal")
})

test("diagnoses an incomplete tool only after the selected stream has ended", () => {
  const events: Input["events"] = [
    event({
      attemptOrdinal: 1,
      event: { eventType: "tool_start", payload: { toolCallId: "call-1", toolName: "read" } },
      streamId: "stream",
    }),
    event({
      attemptOrdinal: 1,
      event: {
        eventType: "tool_output",
        payload: { output: "partial", toolCallId: "call-1", truncated: false },
      },
      streamId: "stream",
    }),
  ]

  const running = normalize({ events, run: { status: "running" } })
  expect(running.activities).toEqual([
    { kind: "tool", name: "read", phase: "started" },
    { content: "partial", kind: "tool", name: "read", phase: "output", truncated: false },
  ])
  expect(running.invariantViolations).toEqual([])
  expect(running.terminalOutcome).toBeNull()

  const ended = normalize({ events, streamEnded: true })
  expect(ended.invariantViolations).toEqual(["unexpected_stream_end", "incomplete_tool_lifecycle"])
  expect(ended.terminalOutcome).toBeNull()
})

test("diagnoses an incomplete tool before a terminal without fabricating a result", () => {
  const transcript = normalize({
    events: [
      event({
        attemptOrdinal: 1,
        event: { eventType: "tool_start", payload: { toolCallId: "call-1", toolName: "read" } },
        streamId: "stream",
      }),
      event({
        attemptOrdinal: 1,
        event: { eventType: "terminal", payload: { status: "completed" } },
        streamId: "stream",
      }),
    ],
  })

  expect(transcript.invariantViolations).toEqual(["incomplete_tool_lifecycle"])
  expect(transcript.activities).toEqual([{ kind: "tool", name: "read", phase: "started" }])
  expect(transcript.terminalOutcome).toEqual({ status: "completed" })
})

test("reports attempt status conflicts while preserving failed-attempt text exclusion", () => {
  const terminalConflict = normalize({
    attempts: [{ ordinal: 1, status: "failed", streamId: "stream" }],
    events: [
      event({
        attemptOrdinal: 1,
        event: { eventType: "text_delta", payload: { delta: "failed text" } },
        streamId: "stream",
      }),
      event({
        attemptOrdinal: 1,
        event: { eventType: "terminal", payload: { status: "completed" } },
        streamId: "stream",
      }),
    ],
  })

  expect(terminalConflict.invariantViolations).toEqual(["attempt_terminal_status_conflict"])
  expect(terminalConflict.assistantText).toBe("")
  expect(terminalConflict.terminalOutcome).toEqual({ status: "completed" })

  const runConflict = normalize({
    attempts: [{ ordinal: 1, status: "succeeded", streamId: "stream" }],
    events: [
      event({
        attemptOrdinal: 1,
        event: { eventType: "text_delta", payload: { delta: "must not leak" } },
        streamId: "stream",
      }),
    ],
    run: { status: "aborted" },
  })

  expect(runConflict.invariantViolations).toEqual(["attempt_run_status_conflict"])
  expect(runConflict.assistantText).toBe("")
  expect(runConflict.terminalOutcome).toEqual({ status: "aborted" })
})

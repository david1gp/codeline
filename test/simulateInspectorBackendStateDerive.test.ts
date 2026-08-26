import { expect, test } from "bun:test"
import { simulateInspectorBackendStateDerive } from "../src/ui/simulate/simulateInspectorBackendStateDerive.js"

test("simulation inspector derives the latest attempt stream and filters synchronized events to it", () => {
  const state = simulateInspectorBackendStateDerive({
    events: [
      { eventType: "RUN_STARTED", streamId: "attempt-1" },
      { eventType: "RUN_ERROR", streamId: "attempt-1" },
      { eventType: "RUN_STARTED", streamId: "attempt-2" },
      { eventType: "TEXT_MESSAGE_CONTENT", streamId: "attempt-2" },
      { eventType: "RUN_FINISHED", streamId: "attempt-2" },
    ],
    run: {
      attempts: [
        { id: "attempt-row-1", ordinal: 1, status: "failed", streamId: "attempt-1" },
        { id: "attempt-row-2", ordinal: 2, status: "succeeded", streamId: "attempt-2" },
      ],
      cancellationKind: undefined,
      id: "run-1",
      status: "succeeded",
      streamId: "attempt-1",
    },
  })

  expect(state.streamId).toBe("attempt-2")
  expect(state.authoritativeAttemptOrdinal).toBe(2)
  expect(state.authoritativeStreamId).toBe("attempt-2")
  expect(state.invariantViolations).toEqual([])
  expect(state.cancellation).toBeNull()
  expect(state.terminalReason).toBeUndefined()
  expect(state.attempts).toEqual([
    { id: "attempt-row-1", ordinal: 1, status: "failed", streamId: "attempt-1" },
    { id: "attempt-row-2", ordinal: 2, status: "succeeded", streamId: "attempt-2" },
  ])
  expect(state.eventTotal).toBe(3)
  expect(state.persistedEventTotal).toBe(5)
  expect(state.eventCounts).toEqual([
    { count: 1, eventType: "RUN_FINISHED" },
    { count: 1, eventType: "RUN_STARTED" },
    { count: 1, eventType: "TEXT_MESSAGE_CONTENT" },
  ])
  expect(state.persistedEventCounts).toEqual([
    { count: 1, eventType: "RUN_ERROR" },
    { count: 1, eventType: "RUN_FINISHED" },
    { count: 2, eventType: "RUN_STARTED" },
    { count: 1, eventType: "TEXT_MESSAGE_CONTENT" },
  ])
  expect(state.run).toMatchObject({ id: "run-1", status: "succeeded", streamId: "attempt-1" })
})

test("simulation inspector exposes normalized retry, stream, terminal, cancellation, and invariant diagnostics", () => {
  const state = simulateInspectorBackendStateDerive({
    events: [
      {
        attemptOrdinal: 1,
        eventType: "text_delta",
        payload: { delta: "failed attempt text" },
        sequence: 1,
        streamId: "attempt-1",
      },
      {
        attemptOrdinal: 2,
        eventType: "text_delta",
        payload: { delta: "retry text" },
        sequence: 1,
        streamId: "attempt-2",
      },
      {
        attemptOrdinal: 2,
        eventType: "text_delta",
        payload: { delta: "stray text" },
        sequence: 2,
        streamId: "stray-stream",
      },
      {
        attemptOrdinal: 2,
        eventType: "run-cancelled",
        payload: { reason: "user-requested" },
        sequence: 3,
        streamId: "attempt-2",
      },
      {
        attemptOrdinal: 2,
        eventType: "run-completed",
        payload: {},
        sequence: 4,
        streamId: "attempt-2",
      },
    ],
    run: {
      attempts: [
        { id: "attempt-row-1", ordinal: 1, status: "failed", streamId: "attempt-1" },
        { id: "attempt-row-2", ordinal: 2, status: "aborted", streamId: "attempt-2" },
      ],
      cancellationKind: "requested",
      id: "run-1",
      status: "aborted",
      streamId: "attempt-2",
    },
  })

  expect(state.authoritativeAttemptOrdinal).toBe(2)
  expect(state.authoritativeStreamId).toBe("attempt-2")
  expect(state.cancellation).toEqual({ kind: "requested", reason: "user-requested" })
  expect(state.terminalReason).toBe("user-requested")
  expect(state.invariantViolations).toEqual([
    "stream_isolation",
    "duplicate_terminal",
    "conflicting_terminal",
    "terminal_status_conflict",
  ])
  expect(state.persistedEventTotal).toBe(5)
  expect(state.persistedEventCounts).toEqual([
    { count: 1, eventType: "run-cancelled" },
    { count: 1, eventType: "run-completed" },
    { count: 3, eventType: "text_delta" },
  ])
})

test("simulation inspector can derive a replay stream before a run row exists", () => {
  expect(
    simulateInspectorBackendStateDerive({
      events: [{ eventType: "RUN_ERROR", streamId: "orphan-stream" }],
      run: undefined,
    }),
  ).toMatchObject({
    authoritativeAttemptOrdinal: 1,
    authoritativeStreamId: "orphan-stream",
    eventTotal: 1,
    eventCounts: [{ count: 1, eventType: "RUN_ERROR" }],
    invariantViolations: [],
    streamId: "orphan-stream",
  })
})

test("simulation inspector prefers durable failure metadata over an incomplete terminal event", () => {
  const state = simulateInspectorBackendStateDerive({
    events: [
      {
        attemptOrdinal: 1,
        eventType: "run-failed",
        payload: { failure: { code: "provider_failed", message: "The provider failed." } },
        sequence: 1,
        streamId: "attempt-1",
      },
    ],
    run: {
      attempts: [{ id: "attempt-1", ordinal: 1, status: "failed", streamId: "attempt-1" }],
      cancellationKind: null,
      failure: { code: "provider_timeout", message: "The provider timed out." },
      id: "run-1",
      status: "failed",
      streamId: "attempt-1",
    },
  })

  expect(state.failure).toEqual({ code: "provider_timeout", message: "The provider timed out." })
  expect(state.run).toMatchObject({
    failure: { code: "provider_timeout", message: "The provider timed out." },
    status: "failed",
  })
})

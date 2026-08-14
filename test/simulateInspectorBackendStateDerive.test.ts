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
  expect(state.attempts).toEqual([
    { id: "attempt-row-1", ordinal: 1, status: "failed", streamId: "attempt-1" },
    { id: "attempt-row-2", ordinal: 2, status: "succeeded", streamId: "attempt-2" },
  ])
  expect(state.eventTotal).toBe(3)
  expect(state.eventCounts).toEqual([
    { count: 1, eventType: "RUN_FINISHED" },
    { count: 1, eventType: "RUN_STARTED" },
    { count: 1, eventType: "TEXT_MESSAGE_CONTENT" },
  ])
  expect(state.run).toMatchObject({ id: "run-1", status: "succeeded", streamId: "attempt-1" })
})

test("simulation inspector can derive a replay stream before a run row exists", () => {
  expect(
    simulateInspectorBackendStateDerive({
      events: [{ eventType: "RUN_ERROR", streamId: "orphan-stream" }],
      run: undefined,
    }),
  ).toMatchObject({ eventTotal: 1, eventCounts: [{ count: 1, eventType: "RUN_ERROR" }], streamId: "orphan-stream" })
})

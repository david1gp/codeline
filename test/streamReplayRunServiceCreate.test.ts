import { expect, test } from "bun:test"
import { createResult } from "@adaptive-ds/result"
import type { ExecutionConvexClient } from "../src/convex/executionConvexClient.js"
import { streamReplayRunServiceCreate } from "../src/stream/actions/streamReplayRunServiceCreate.js"

function executionClientCreate(): ExecutionConvexClient {
  const events = new Map([
    [
      "attempt-1",
      [
        { id: "event-1", payload: { type: "TEXT_MESSAGE_CONTENT", delta: "before retry" }, sequence: 1 },
        {
          id: "retry-error",
          payload: { code: "provider_failed", message: "temporary", type: "RUN_ERROR" },
          sequence: 2,
        },
      ],
    ],
    ["attempt-2", [{ id: "event-2", payload: { type: "RUN_FINISHED" }, sequence: 1 }]],
  ])
  return {
    runLoad: async () =>
      createResult({
        attempt: { id: "attempt-2", ordinal: 2, streamId: "attempt-2" } as never,
        attempts: [
          { id: "attempt-1", ordinal: 1, streamId: "attempt-1" },
          { id: "attempt-2", ordinal: 2, streamId: "attempt-2" },
        ] as never,
        run: {} as never,
      }),
    streamEventLoad: async (_userId: string, _sessionId: string, streamId: string, eventId: string) => {
      const event = events.get(streamId)?.find((candidate) => candidate.id === eventId)
      return createResult(event as never)
    },
    streamLatestEvent: async (_userId: string, _sessionId: string, streamId: string, _lastSequence: number) => {
      const event = events.get(streamId)?.at(-1)
      return createResult(event === undefined ? undefined : { id: event.id })
    },
    streamReplay: async (
      _userId: string,
      _sessionId: string,
      streamId: string,
      input: { afterSequence?: number; inactivityTimeoutMs: number; limit?: number },
    ) => {
      const streamEvents = events.get(streamId) ?? []
      return createResult({
        checkpoint: {
          id: `checkpoint-${streamId}`,
          lastSequence: streamEvents.length,
          streamId,
          updatedAt: Date.now(),
        } as never,
        events: streamEvents
          .filter((event) => event.sequence > (input.afterSequence ?? 0))
          .slice(0, input.limit ?? 100) as never,
        stale: false,
      })
    },
  } as unknown as ExecutionConvexClient
}

test("run replay orders retry attempts, resolves opaque cursors, and reports aggregate progress", async () => {
  const service = streamReplayRunServiceCreate({
    executionConvexClient: executionClientCreate(),
    inactivityTimeoutMs: 60_000,
    sessionId: "session-1",
    streamId: "attempt-1",
    userId: "user-1",
  })

  const replay = await service.replay()
  expect(replay).toMatchObject({
    success: true,
    data: { events: [{ id: "event-1" }, { id: "event-2" }], stale: false },
  })

  const cursor = await service.cursor("event-1")
  expect(cursor).toEqual({ success: true, data: { afterSequence: 1, targetIndex: 0 } })
  const resumed = await service.replay({ after: cursor.success ? cursor.data : { afterSequence: 0, targetIndex: 0 } })
  expect(resumed).toMatchObject({ success: true, data: { events: [{ id: "event-2" }] } })

  expect(await service.status()).toMatchObject({
    success: true,
    data: { lastEventId: "event-2", lastSequence: 3, stale: false },
  })
})

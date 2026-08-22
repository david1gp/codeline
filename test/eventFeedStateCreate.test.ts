import { expect, test } from "bun:test"
import { eventFeedStateCreate } from "../src/stream/client/eventFeedStateCreate.js"

function event(id: string, sequence: number, payload: Record<string, unknown>): Record<string, unknown> {
  return { id, sequence, ...payload }
}

function createFeed(initial?: Parameters<typeof eventFeedStateCreate>[0]["initial"]) {
  const feed = eventFeedStateCreate({
    ...(initial === undefined ? {} : { initial }),
  })
  return { feed }
}

test("demultiplexes parallel runs and applies available deltas without numeric contiguity", () => {
  const { feed } = createFeed({ asOfCursor: "cursor-10", lastEventId: "cursor-10" })
  expect(
    feed.apply(
      event("cursor-12", 12, {
        delta: "a",
        deltaKind: "text",
        eventType: "delta",
        messageId: "message-a",
        runId: "run-a",
        sessionId: "session-a",
      }),
    ),
  ).toMatchObject({ success: true })
  expect(
    feed.apply(
      event("cursor-20", 20, {
        delta: "b",
        deltaKind: "text",
        eventType: "delta",
        messageId: "message-b",
        runId: "run-b",
        sessionId: "session-b",
      }),
    ),
  ).toMatchObject({ success: true })
  expect(
    feed.apply(
      event("cursor-15", 15, {
        delta: "c",
        deltaKind: "text",
        eventType: "delta",
        messageId: "message-a",
        runId: "run-a",
        sessionId: "session-a",
      }),
    ),
  ).toMatchObject({ success: true })

  const state = feed.state()
  expect(state.lastEventId).toBe("cursor-20")
  expect(state.asOfCursor).toBe("cursor-20")
  expect(state.activeRuns.get("run-a")).toMatchObject({ partialText: "a", sessionId: "session-a" })
  expect(state.activeRuns.get("run-b")).toMatchObject({ partialText: "b", sessionId: "session-b" })
})

test("ignores stale invalidations and requests newer resource reconciliation", () => {
  const { feed } = createFeed({
    asOfCursor: "cursor-1",
    lastEventId: "cursor-1",
    resourceRevisions: [{ resourceId: "session-1", resourceType: "session", revision: 4 }],
  })
  const stale = feed.apply(
    event("cursor-2", 2, {
      eventType: "invalidate",
      resourceId: "session-1",
      resourceType: "session",
      revision: 4,
    }),
  )
  expect(stale).toMatchObject({ success: true, data: { ignored: "stale-invalidation" } })

  const newer = feed.apply(
    event("cursor-3", 3, {
      eventType: "invalidate",
      resourceId: "session-1",
      resourceType: "session",
      revision: 5,
    }),
  )
  expect(newer).toMatchObject({
    success: true,
    data: { instruction: { kind: "resource-stale", serverRevision: 5 } },
  })
  expect(feed.state().staleResources.get("session:session-1")).toMatchObject({ cachedRevision: 4, serverRevision: 5 })
})

test("deduplicates events and completion supersedes deltas with authoritative replacement", () => {
  const { feed } = createFeed({ asOfCursor: "cursor-1", lastEventId: "cursor-1" })
  const delta = event("cursor-2", 2, {
    delta: "partial",
    deltaKind: "text",
    eventType: "delta",
    messageId: "message-1",
    runId: "run-1",
    sessionId: "session-1",
  })
  expect(feed.apply(delta)).toMatchObject({ success: true, data: { applied: true } })
  expect(feed.apply(delta)).toMatchObject({ success: true, data: { applied: false, ignored: "duplicate" } })

  const completed = feed.apply(
    event("cursor-3", 3, {
      eventType: "run-completed",
      messageId: "message-1",
      runId: "run-1",
      sessionId: "session-1",
      sessionRevision: 9,
    }),
  )
  expect(completed).toMatchObject({
    success: true,
    data: { instruction: { authoritative: "session-snapshot", preserveDeltas: false } },
  })
  expect(feed.state().activeRuns.get("run-1")).toMatchObject({ deltas: [], partialText: "", superseded: true })

  const lateDelta = feed.apply(
    event("cursor-4", 4, {
      delta: "late",
      deltaKind: "text",
      eventType: "delta",
      messageId: "message-1",
      runId: "run-1",
      sessionId: "session-1",
    }),
  )
  expect(lateDelta).toMatchObject({ success: true, data: { ignored: "terminal-run" } })
  expect(feed.state().activeRuns.get("run-1")?.partialText).toBe("")
})

test("maps lifecycle checkpoints to active-state reconciliation and accepts authoritative replacement", () => {
  const { feed } = createFeed({ asOfCursor: "cursor-1", lastEventId: "cursor-1" })
  expect(
    feed.apply(
      event("cursor-2", 2, {
        delta: "partial",
        deltaKind: "text",
        eventType: "delta",
        messageId: "message-1",
        runId: "run-1",
        sessionId: "session-1",
      }),
    ),
  ).toMatchObject({ success: true })
  expect(
    feed.apply(
      event("cursor-3", 3, {
        eventType: "run-failed",
        failure: { code: "provider-failed", message: "failed" },
        runId: "run-1",
        sessionId: "session-1",
        sessionRevision: 3,
      }),
    ),
  ).toMatchObject({ success: true, data: { instruction: { kind: "run-checkpoint", preserveDeltas: true } } })
  expect(feed.state().activeRuns.get("run-1")).toMatchObject({ phase: "reconciling", partialText: "partial" })

  expect(
    feed.runReplace({
      lastSequence: 3,
      partialText: "authoritative",
      runId: "run-1",
      sessionId: "session-1",
      status: "failed",
    }),
  ).toMatchObject({ success: true })
  expect(feed.state().activeRuns.get("run-1")).toMatchObject({
    phase: "settled",
    partialText: "authoritative",
    deltas: [],
  })
})

test("maps failed, cancelled, and interrupted checkpoints to active-run reconciliation", () => {
  const lifecycleEvents = [
    {
      eventType: "run-failed",
      failure: null,
    },
    {
      eventType: "run-cancelled",
      reason: "user-requested",
    },
    {
      eventType: "run-interrupted",
      reason: "api-restarted",
    },
  ] as const

  for (const [index, lifecycle] of lifecycleEvents.entries()) {
    const { feed } = createFeed({ asOfCursor: "cursor-1", lastEventId: "cursor-1" })
    const result = feed.apply(
      event(`cursor-${index + 2}`, index + 2, {
        ...lifecycle,
        runId: "run-1",
        sessionId: "session-1",
        sessionRevision: index + 2,
      }),
    )
    expect(result).toMatchObject({
      success: true,
      data: {
        instruction: {
          checkpoint: lifecycle.eventType.slice("run-".length),
          kind: "run-checkpoint",
          preserveDeltas: true,
        },
      },
    })
    expect(feed.state().activeRuns.get("run-1")).toMatchObject({
      checkpoint: lifecycle.eventType.slice("run-".length),
      phase: "reconciling",
    })
  }
})

test("parses one JSON SSE event, rejects malformed data without mutation, and handles reset non-destructively", () => {
  const { feed } = createFeed({
    asOfCursor: "cursor-4",
    lastEventId: "cursor-4",
    settledCacheKeys: ["session-settled"],
  })
  const parsed = feed.applySse({
    data: JSON.stringify(
      event("cursor-5", 5, {
        delta: "live",
        deltaKind: "text",
        eventType: "delta",
        messageId: "message-1",
        runId: "run-1",
        sessionId: "session-1",
      }),
    ),
    event: "delta",
    id: "cursor-5",
  })
  expect(parsed).toMatchObject({ success: true, data: { applied: true } })
  const beforeMalformed = feed.state()
  expect(feed.applySse({ data: "{not-json", event: "delta", id: "cursor-bad" })).toMatchObject({
    code: "invalid_event",
    success: false,
  })
  expect(feed.state()).toMatchObject({
    lastEventId: beforeMalformed.lastEventId,
    asOfCursor: beforeMalformed.asOfCursor,
  })

  expect(
    feed.apply(
      event("cursor-reset", 6, {
        asOfSequence: 100,
        eventType: "reset",
        reason: "cursor-expired",
      }),
    ),
  ).toMatchObject({
    success: true,
    data: { instruction: { preserveSettledCaches: true, resetCheckpoint: "cursor-reset" } },
  })
  expect(feed.state()).toMatchObject({
    settledCacheKeys: ["session-settled"],
    lastEventId: "cursor-5",
    asOfCursor: "cursor-5",
  })

  expect(
    feed.resetComplete({
      asOfCursor: "opaque-reset-cursor",
      lastEventId: "cursor-100",
      resetCheckpoint: "cursor-other",
    }),
  ).toMatchObject({ success: false })
  expect(feed.state()).toMatchObject({ asOfCursor: "cursor-5", lastEventId: "cursor-5" })
  expect(
    feed.resetComplete({
      asOfCursor: "opaque-reset-cursor",
      lastEventId: "cursor-100",
      resetCheckpoint: "cursor-reset",
    }),
  ).toMatchObject({
    success: true,
  })
  expect(feed.state()).toMatchObject({
    settledCacheKeys: ["session-settled"],
    lastEventId: "cursor-100",
    asOfCursor: "opaque-reset-cursor",
  })
})

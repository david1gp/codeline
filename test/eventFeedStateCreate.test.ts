import { expect, test } from "bun:test"
import { eventFeedStateCreate } from "../src/stream/client/eventFeedStateCreate.js"

function event(id: string, sequence: number, payload: Record<string, unknown>): Record<string, unknown> {
  const eventType = payload.eventType
  const terminal =
    typeof eventType === "string" &&
    ["run-cancelled", "run-completed", "run-failed", "run-interrupted"].includes(eventType)
  return { id, sequence, ...(terminal ? { changePosition: sequence } : {}), ...payload }
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

test("deduplicates events and retains a completed run tail until authoritative replacement", () => {
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
    data: {
      instruction: {
        authoritative: "session-snapshot",
        changePosition: 3,
        preserveDeltas: true,
        terminalKind: "completed",
      },
    },
  })
  expect(feed.state().activeRuns.get("run-1")).toMatchObject({
    partialText: "partial",
    superseded: false,
    terminalKind: "completed",
  })

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
  expect(feed.state().activeRuns.get("run-1")?.partialText).toBe("partial")
})

test("registers a run from its typed start event before the first delta", () => {
  const { feed } = createFeed({ asOfCursor: "cursor-1", lastEventId: "cursor-1" })
  expect(
    feed.apply(
      event("cursor-2", 2, {
        eventType: "run-started",
        runId: "run-1",
        sessionId: "session-1",
      }),
    ),
  ).toMatchObject({ success: true, data: { applied: true, instruction: null } })
  expect(feed.state().activeRuns.get("run-1")).toMatchObject({
    lastSequence: 0,
    phase: "active",
    partialText: "",
    terminalStatus: null,
  })

  expect(
    feed.apply(
      event("cursor-3", 3, {
        delta: "first",
        deltaKind: "text",
        eventType: "delta",
        messageId: null,
        runId: "run-1",
        sessionId: "session-1",
      }),
    ),
  ).toMatchObject({ success: true, data: { applied: true } })
  expect(feed.state().activeRuns.get("run-1")).toMatchObject({ lastSequence: 3, partialText: "first" })
})

test("maps failure to authoritative session reconciliation while retaining its visible tail", () => {
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
  ).toMatchObject({
    success: true,
    data: { instruction: { kind: "authoritative-replacement", preserveDeltas: true, terminalKind: "failed" } },
  })
  expect(feed.state().activeRuns.get("run-1")).toMatchObject({
    phase: "reconciling",
    partialText: "partial",
    terminalKind: "failed",
  })
})

test("preserves every exact terminal kind in authoritative reconciliation", () => {
  const lifecycleEvents = [
    {
      eventType: "run-completed",
      messageId: "message-1",
    },
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
          kind: "authoritative-replacement",
          preserveDeltas: true,
          terminalKind: lifecycle.eventType.slice("run-".length),
        },
      },
    })
    expect(feed.state().activeRuns.get("run-1")).toMatchObject({
      checkpoint: lifecycle.eventType.slice("run-".length),
      phase: "reconciling",
      terminalKind: lifecycle.eventType.slice("run-".length),
    })
  }
})

test("rejects stale and conflicting terminal events by session change position", () => {
  const { feed } = createFeed({ asOfCursor: "cursor-1", lastEventId: "cursor-1" })
  expect(
    feed.apply(
      event("cursor-10", 10, {
        changePosition: 8,
        eventType: "run-cancelled",
        runId: "run-1",
        sessionId: "session-1",
        sessionRevision: 2,
      }),
    ),
  ).toMatchObject({ success: true, data: { applied: true } })

  expect(
    feed.apply(
      event("cursor-11", 11, {
        changePosition: 7,
        eventType: "run-interrupted",
        reason: "stale",
        runId: "run-1",
        sessionId: "session-1",
        sessionRevision: 3,
      }),
    ),
  ).toMatchObject({ success: true, data: { ignored: "stale-event", instruction: null } })
  expect(
    feed.apply(
      event("cursor-12", 12, {
        changePosition: 9,
        eventType: "run-failed",
        failure: null,
        runId: "run-1",
        sessionId: "session-1",
        sessionRevision: 4,
      }),
    ),
  ).toMatchObject({ success: true, data: { ignored: "terminal-run", instruction: null } })
  expect(feed.state().activeRuns.get("run-1")).toMatchObject({
    terminalChangePosition: 8,
    terminalKind: "cancelled",
  })
})

test("parses one global-summary SSE event, rejects detail deltas, and handles reset non-destructively", () => {
  const { feed } = createFeed({
    asOfCursor: "cursor-4",
    lastEventId: "cursor-4",
    settledCacheKeys: ["session-settled"],
  })
  const parsed = feed.applySse({
    data: JSON.stringify({
      eventType: "run-started",
      globalSequence: 5,
      id: "cursor-5",
      runId: "run-1",
      sessionId: "session-1",
    }),
    event: "run-started",
    id: "cursor-5",
  })
  expect(parsed).toMatchObject({ success: true, data: { applied: true } })
  const beforeMalformed = feed.state()
  expect(feed.applySse({ data: "{not-json", event: "run-started", id: "cursor-bad" })).toMatchObject({
    code: "invalid_event",
    success: false,
  })
  expect(
    feed.applySse({
      data: JSON.stringify(
        event("cursor-detail", 6, {
          delta: "not-global",
          deltaKind: "text",
          eventType: "delta",
          messageId: null,
          runId: "run-1",
          sessionId: "session-1",
        }),
      ),
      event: "delta",
      id: "cursor-detail",
    }),
  ).toMatchObject({ code: "invalid_event", success: false })
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

import { expect, test } from "bun:test"
import { eventFeedStateCreate } from "../src/stream/client/eventFeedStateCreate.js"

function globalSummary(id: string, globalSequence: number, payload: Record<string, unknown>): Record<string, unknown> {
  return { globalSequence, id, ...payload }
}

function createFeed(initial?: Parameters<typeof eventFeedStateCreate>[0]["initial"]) {
  return eventFeedStateCreate({
    ...(initial === undefined ? {} : { initial }),
  })
}

test("tracks global-summary lifecycle events with an opaque global cursor", () => {
  const feed = createFeed({ asOfCursor: "cursor-10", lastEventId: "cursor-10" })

  expect(
    feed.apply(
      globalSummary("cursor-12", 12, {
        eventType: "run-started",
        runId: "run-a",
        sessionId: "session-a",
      }),
    ),
  ).toMatchObject({ success: true, data: { applied: true, instruction: null } })
  expect(
    feed.apply(
      globalSummary("cursor-20", 20, {
        changePosition: 1,
        eventType: "run-completed",
        messageId: null,
        runId: "run-a",
        sessionId: "session-a",
        sessionRevision: 2,
      }),
    ),
  ).toMatchObject({ success: true, data: { applied: true, instruction: null } })

  expect(feed.state()).toMatchObject({ asOfCursor: "cursor-20", lastEventId: "cursor-20" })
})

test("ignores stale invalidations and requests newer resource reconciliation", () => {
  const feed = createFeed({
    asOfCursor: "cursor-1",
    lastEventId: "cursor-1",
    resourceRevisions: [{ resourceId: "session-1", resourceType: "session", revision: 4 }],
  })
  const stale = feed.apply(
    globalSummary("cursor-2", 2, {
      eventType: "invalidate",
      resourceId: "session-1",
      resourceType: "session",
      revision: 4,
    }),
  )
  expect(stale).toMatchObject({ success: true, data: { ignored: "stale-invalidation", instruction: null } })

  const newer = feed.apply(
    globalSummary("cursor-3", 3, {
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

  expect(feed.resourceReplace({ resourceId: "session-1", resourceType: "session", revision: 5 })).toMatchObject({
    success: true,
  })
  expect(feed.state().staleResources.size).toBe(0)
})

test("rejects detail deltas from the global-summary state", () => {
  const feed = createFeed({ asOfCursor: "cursor-1", lastEventId: "cursor-1" })
  const result = feed.apply({
    delta: "detail payload",
    deltaKind: "text",
    eventType: "delta",
    id: "cursor-2",
    messageId: null,
    runId: "run-1",
    sequence: 2,
    sessionId: "session-1",
  })

  expect(result).toMatchObject({ success: false })
  expect(feed.state()).toMatchObject({ asOfCursor: "cursor-1", lastEventId: "cursor-1" })
})

test("reconciles a reset without replacing bounded-cache state", () => {
  const feed = createFeed({ asOfCursor: "cursor-1", lastEventId: "cursor-1" })
  expect(
    feed.apply(
      globalSummary("cursor-reset", 2, {
        asOfGlobalSequence: 2,
        eventType: "reset",
        reason: "cursor-expired",
      }),
    ),
  ).toMatchObject({
    success: true,
    data: { instruction: { kind: "reset", preserveBoundedCaches: true, resetCheckpoint: "cursor-reset" } },
  })

  expect(
    feed.resetValidate({
      asOfCursor: "cursor-after-reset",
      lastEventId: "cursor-after-reset",
      resetCheckpoint: "cursor-reset",
      resourceRevisions: [],
    }),
  ).toMatchObject({ success: true })
  expect(
    feed.resetCommit({
      asOfCursor: "cursor-after-reset",
      lastEventId: "cursor-after-reset",
      resetCheckpoint: "cursor-reset",
      resourceRevisions: [],
    }),
  ).toMatchObject({ success: true })
  expect(feed.state()).toMatchObject({ asOfCursor: "cursor-after-reset", lastEventId: "cursor-after-reset" })
})

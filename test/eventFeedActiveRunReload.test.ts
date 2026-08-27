import { expect, test } from "bun:test"
import { eventFeedStateCreate } from "../src/stream/client/eventFeedStateCreate.js"
import { eventFeedReconciliationCreate } from "../src/ui/eventFeedReconciliationCreate.js"

function journalEvent(id: string, sequence: number, payload: Record<string, unknown>): Record<string, unknown> {
  return { id, sequence, ...payload }
}

function runDelta(id: string, sequence: number, delta: string): Record<string, unknown> {
  return journalEvent(id, sequence, {
    delta,
    deltaKind: "text",
    eventType: "delta",
    messageId: "message-1",
    runId: "run-1",
    sessionId: "session-1",
  })
}

test("reload reconciliation reads the run-specific active snapshot instead of the session stream snapshot", async () => {
  const requested: string[] = []
  const reconciliation = eventFeedReconciliationCreate({
    fetch: async (input) => {
      requested.push(String(input))
      return Response.json({ lastSequence: 12, partialText: "hello world", status: "running" })
    },
  })

  const loaded = await reconciliation.activeRunSnapshotLoad({
    lastSequence: 0,
    reason: "reset",
    runId: "run-1",
    sessionId: "session-1",
  })

  expect(loaded).toEqual({
    success: true,
    data: {
      lastSequence: 12,
      partialText: "hello world",
      runId: "run-1",
      sessionId: "session-1",
      status: "running",
    },
  })
  expect(requested).toEqual(["/api/sessions/session-1/runs/run-1/snapshot"])
  expect(requested.some((path) => path.includes("stream-snapshot"))).toBe(false)
})

test("reload reconciliation reports the run-specific snapshot failure", async () => {
  const reconciliation = eventFeedReconciliationCreate({
    fetch: async () => new Response("", { status: 500, statusText: "Internal Server Error" }),
  })

  const loaded = await reconciliation.activeRunSnapshotLoad({
    lastSequence: 0,
    reason: "reset",
    runId: "run-1",
    sessionId: "session-1",
  })

  expect(loaded).toMatchObject({ op: "eventFeedActiveRunSnapshotLoad", success: false })
})

test("partial state is replaced from the snapshot and the feed attaches after lastSequence", () => {
  const feed = eventFeedStateCreate({ initial: { asOfCursor: "cursor-1", lastEventId: "cursor-1" } })

  expect(
    feed.runReplace({
      lastSequence: 12,
      partialText: "hello world",
      runId: "run-1",
      sessionId: "session-1",
      status: "running",
    }),
  ).toMatchObject({ success: true })
  expect(feed.state().activeRuns.get("run-1")).toMatchObject({
    deltas: [],
    lastSequence: 12,
    partialText: "hello world",
    phase: "active",
  })

  // Deltas already folded into the snapshot must not be applied twice.
  expect(feed.apply(runDelta("cursor-9", 9, "world"))).toMatchObject({
    success: true,
    data: { ignored: "stale-event" },
  })
  expect(feed.apply(runDelta("cursor-12", 12, "world"))).toMatchObject({
    success: true,
    data: { ignored: "stale-event" },
  })
  expect(feed.state().activeRuns.get("run-1")?.partialText).toBe("hello world")

  expect(feed.apply(runDelta("cursor-13", 13, "!"))).toMatchObject({ success: true, data: { applied: true } })
  expect(feed.state().activeRuns.get("run-1")).toMatchObject({ lastSequence: 13, partialText: "hello world!" })
})

test("a run first observed on the feed keeps applying its deltas from the first fragment", () => {
  const feed = eventFeedStateCreate({ initial: { asOfCursor: "cursor-1", lastEventId: "cursor-1" } })

  expect(feed.apply(runDelta("cursor-2", 2, "a"))).toMatchObject({ success: true, data: { applied: true } })
  expect(feed.apply(runDelta("cursor-3", 3, "b"))).toMatchObject({ success: true, data: { applied: true } })
  expect(feed.state().activeRuns.get("run-1")).toMatchObject({ lastSequence: 3, partialText: "ab" })
})

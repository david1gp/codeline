import { expect, test } from "bun:test"
import { createResult } from "@adaptive-ds/result"
import { eventFeedCreate } from "../src/events/client/eventFeedCreate.js"
import { eventFeedOwnerRegistryCreate } from "../src/events/client/eventFeedOwnerRegistryCreate.js"
import type { SessionSettledSnapshotResponse } from "../src/session/api/sessionSettledSnapshotResponseSchema.js"
import type { GlobalSummarySseFrame } from "../src/stream/api/globalSummarySseFrameSchema.js"

type FakeListener = (event: Event) => void
type FeedOptions = Parameters<typeof eventFeedCreate>[0]

class FakeEventSource {
  readonly listeners = new Map<string, Set<FakeListener>>()
  readonly url: string
  closeCount = 0
  onerror: ((event: Event) => void) | null = null
  onopen: ((event: Event) => void) | null = null
  readyState = 0

  constructor(url: string) {
    this.url = url
  }

  addEventListener(type: string, listener: FakeListener): void {
    const current = this.listeners.get(type) ?? new Set<FakeListener>()
    current.add(listener)
    this.listeners.set(type, current)
  }

  close(): void {
    this.closeCount += 1
    this.readyState = 2
  }

  emit(frame: GlobalSummarySseFrame): void {
    const event = new Event(frame.event) as Event & { data?: unknown; lastEventId?: unknown }
    event.data = JSON.stringify(frame.data)
    event.lastEventId = frame.id
    for (const listener of [...(this.listeners.get(frame.event) ?? [])]) listener(event)
  }

  error(readyState = 0): void {
    this.readyState = readyState
    this.onerror?.(new Event("error"))
  }

  open(): void {
    this.readyState = 1
    this.onopen?.(new Event("open"))
  }

  removeEventListener(type: string, listener: FakeListener): void {
    this.listeners.get(type)?.delete(listener)
  }
}

function frame(
  eventType: GlobalSummarySseFrame["event"],
  globalSequence: number,
  values: Record<string, unknown> = {},
): GlobalSummarySseFrame {
  const id = `cursor-${globalSequence}`
  const data = {
    eventType,
    globalSequence,
    id,
    ...(eventType === "invalidate"
      ? { resourceId: "session-1", resourceType: "session", revision: 2 }
      : eventType === "run-started"
        ? { runId: "run-1", sessionId: "session-1" }
        : eventType === "run-completed"
          ? {
              changePosition: globalSequence,
              messageId: null,
              runId: "run-1",
              sessionId: "session-1",
              sessionRevision: 2,
            }
          : eventType === "run-failed"
            ? {
                changePosition: globalSequence,
                failure: null,
                runId: "run-1",
                sessionId: "session-1",
                sessionRevision: 2,
              }
            : eventType === "run-cancelled"
              ? {
                  changePosition: globalSequence,
                  reason: "user-requested",
                  runId: "run-1",
                  sessionId: "session-1",
                  sessionRevision: 2,
                }
              : eventType === "run-interrupted"
                ? {
                    changePosition: globalSequence,
                    reason: "api-restarted",
                    runId: "run-1",
                    sessionId: "session-1",
                    sessionRevision: 2,
                  }
                : eventType === "input-needed"
                  ? { requestId: "request-1", runId: "run-1", sessionId: "session-1", sessionRevision: 2 }
                  : { asOfGlobalSequence: globalSequence, reason: "cursor-expired" }),
    ...values,
  }
  return { data, event: eventType, id } as GlobalSummarySseFrame
}

function sessionSnapshot(sessionId: string, revision: number): SessionSettledSnapshotResponse {
  const timestamp = "2026-01-01T00:00:00.000Z"
  return {
    asOfCursor: `cursor-${revision}`,
    asOfSequence: revision,
    etag: `"session-${revision}"`,
    messages: [],
    revision,
    schemaVersion: "session-snapshot-v1",
    session: {
      archivedAt: null,
      createdAt: timestamp,
      id: sessionId,
      metadata: null,
      parentSessionId: null,
      pinned: false,
      primaryAgentId: "agent-1",
      projectPath: "/tmp/project",
      revision,
      serverId: "server-1",
      title: sessionId,
      updatedAt: timestamp,
    },
    settled: true,
  }
}

function callbacks(overrides: Partial<FeedOptions["reconciliation"]> = {}): FeedOptions["reconciliation"] {
  return {
    activeRunSnapshotLoad: async (input) =>
      createResult({
        lastSequence: input.lastSequence,
        partialText: "",
        runId: input.runId,
        sessionId: input.sessionId,
        status: "running",
      }),
    resourceRevalidate: async (input) =>
      createResult({ resourceId: input.resourceId, resourceType: input.resourceType, revision: input.serverRevision }),
    sessionSnapshotLoad: async (input) => createResult(sessionSnapshot(input.sessionId, input.sessionRevision ?? 1)),
    sessionSnapshotReplace: async () => createResult(undefined),
    shellListBootstrap: async (input) =>
      createResult({
        activeRuns: [],
        asOfCursor: "cursor-after-reset",
        resetCheckpoint: input.resetCheckpoint,
        resourceRevisions: [],
      }),
    visibleResources: () => [],
    ...overrides,
  }
}

function feedCreate(overrides: Partial<FeedOptions> = {}) {
  const sources: FakeEventSource[] = []
  const feed = eventFeedCreate({
    bootstrap: { asOfCursor: "cursor-0", lastEventId: "cursor-0" },
    eventSourceFactory: (url) => {
      const source = new FakeEventSource(url)
      sources.push(source)
      return source
    },
    ownershipRegistry: eventFeedOwnerRegistryCreate(),
    reconciliation: callbacks(),
    ...overrides,
  })
  const source = sources[0]
  if (source === undefined) throw new Error("missing global summary source")
  return { feed, source, sources }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

test("global feed consumes summary frames without subscribing to selected detail deltas", async () => {
  const events: GlobalSummarySseFrame[] = []
  const { feed, source } = feedCreate({ onEvent: (event) => events.push(event) })
  expect(source.url).toBe("/api/events?after=cursor-0")
  expect(source.listeners.has("delta")).toBe(false)

  source.open()
  source.emit(frame("run-started", 1))
  expect(feed.dataState.activeRuns.get("run-1")).toMatchObject({ sessionId: "session-1" })
  source.emit(frame("run-completed", 2))
  await flush()

  expect(events.map((event) => event.data.globalSequence)).toEqual([1, 2])
  expect(feed.dataState.activeRuns.has("run-1")).toBe(false)
  expect(feed.getUrl()).toBe("/api/events?after=cursor-2")
  feed.close()
})

test("global feed ignores stale global sequences and applies input-needed as a lightweight invalidation", async () => {
  const revisions: number[] = []
  const { feed, source } = feedCreate({
    reconciliation: callbacks({
      resourceRevalidate: async (input) => {
        revisions.push(input.serverRevision)
        return createResult({
          resourceId: input.resourceId,
          resourceType: input.resourceType,
          revision: input.serverRevision,
        })
      },
    }),
  })

  source.emit(frame("input-needed", 4, { sessionRevision: 4 }))
  source.emit(frame("invalidate", 3, { revision: 3 }))
  await flush()
  expect(revisions).toEqual([4])
  expect(feed.getUrl()).toBe("/api/events?after=cursor-4")
  feed.close()
})

test("global feed reconnects from its own cursor independently of selected-session cursors", () => {
  const { feed, source, sources } = feedCreate()
  source.emit(frame("invalidate", 3, { revision: 3 }))
  feed.reconnect()
  feed.online()

  expect(source.closeCount).toBe(1)
  expect(sources[1]?.url).toBe("/api/events?after=cursor-3")
  feed.close()
})

test("global reset closes the old source and reopens from the reconciled global cursor", async () => {
  const { feed, source, sources } = feedCreate()
  source.emit(frame("reset", 5))
  expect(source.closeCount).toBe(1)
  await flush()

  expect(sources[1]?.url).toBe("/api/events?after=cursor-after-reset")
  feed.close()
})

test("global feed reports an authentication failure and owns one source registry lease", () => {
  let authenticationErrors = 0
  const registry = eventFeedOwnerRegistryCreate()
  const first = feedCreate({
    onAuthenticationError: () => {
      authenticationErrors += 1
    },
    ownershipRegistry: registry,
  })
  expect(() => feedCreate({ ownershipRegistry: registry })).toThrow()
  first.source.error(2)
  expect(authenticationErrors).toBe(1)
  expect(first.feed.getState().status).toBe("offline")
  first.feed.close()
})

test("rejects an older terminal replacement without dropping the retained run tail", async () => {
  const errors: string[] = []
  let replacementCalls = 0
  const { feed, source } = feedCreate({
    onError: (result) => {
      if (!result.success) errors.push(result.errorMessage)
    },
    reconciliation: callbacks({
      sessionSnapshotLoad: (input) => createResult(sessionSnapshot(input.sessionId, 1)),
      sessionSnapshotReplace: () => {
        replacementCalls += 1
        return createResult(undefined)
      },
    }),
  })
  expect(
    feed.activeRunAttach({
      lastCursor: null,
      lastSequence: 4,
      partialText: "retained tail",
      runId: "run-1",
      sessionId: "session-1",
      status: "running",
    }),
  ).toMatchObject({ success: true })

  source.emit(frame("run-failed", 5, { changePosition: 9, sessionRevision: 2 }))
  await flush()

  expect(replacementCalls).toBe(0)
  expect(errors).toContain("The session snapshot is older than the terminal event.")
  expect(feed.dataState.activeRuns.get("run-1")).toMatchObject({
    partialText: "retained tail",
    terminalChangePosition: 9,
    terminalKind: "failed",
  })
  feed.close()
})

test("ignores a delayed terminal replacement after a newer reset generation", async () => {
  let replacementResolve: ((value: ReturnType<typeof createResult<SessionSettledSnapshotResponse>>) => void) | undefined
  const delayedReplacement = new Promise<ReturnType<typeof createResult<SessionSettledSnapshotResponse>>>((resolve) => {
    replacementResolve = resolve
  })
  let replacementCalls = 0
  const { feed, source } = feedCreate({
    reconciliation: callbacks({
      sessionSnapshotLoad: () => delayedReplacement,
      sessionSnapshotReplace: () => {
        replacementCalls += 1
        return createResult(undefined)
      },
    }),
  })

  source.emit(frame("run-completed", 1, { changePosition: 5, sessionRevision: 1 }))
  source.emit(frame("reset", 2))
  await flush()
  replacementResolve?.(createResult(sessionSnapshot("session-1", 1)))
  await flush()

  expect(replacementCalls).toBe(0)
  expect(feed.dataState.activeRuns.has("run-1")).toBe(false)
  feed.close()
})

import { expect, test } from "bun:test"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { createRoot } from "solid-js/dist/solid.js"
import { eventFeedCreate } from "../src/events/client/eventFeedCreate.js"
import { eventFeedOwnerRegistryCreate } from "../src/events/client/eventFeedOwnerRegistryCreate.js"
import { authSessionStateCreate } from "../src/identity/ui/authSessionStateCreate.js"
import type { RunActiveSummary } from "../src/run/api/runActiveSummarySchema.js"
import type { SessionSettledSnapshotResponse } from "../src/session/api/sessionSettledSnapshotResponseSchema.js"
import type { StreamSseFrame } from "../src/stream/api/streamSseFrameSchema.js"
import type { EventFeedResourceRevision } from "../src/stream/client/eventFeedStateCreate.js"

type FakeEventListener = (event: Event) => void
type FeedOptions = Parameters<typeof eventFeedCreate>[0]

class FakeEventSource {
  readonly listeners = new Map<string, Set<FakeEventListener>>()
  readonly url: string
  readonly withCredentials: boolean
  closeCount = 0
  onerror: ((event: Event) => void) | null = null
  onopen: ((event: Event) => void) | null = null
  readyState = 0

  constructor(url: string, options: { withCredentials: boolean }) {
    this.url = url
    this.withCredentials = options.withCredentials
  }

  addEventListener(type: string, listener: FakeEventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<FakeEventListener>()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  close(): void {
    this.closeCount += 1
    this.readyState = 2
  }

  emit(frame: StreamSseFrame): void {
    const message = new Event(frame.event) as Event & { data?: unknown; lastEventId?: unknown }
    message.data = JSON.stringify(frame.data)
    message.lastEventId = frame.id
    for (const listener of [...(this.listeners.get(frame.event) ?? [])]) listener(message)
  }

  error(): void {
    this.readyState = 0
    this.onerror?.(new Event("error"))
  }

  reconnect(responseStatus: number): void {
    if (responseStatus === 401) {
      this.readyState = 2
      this.onerror?.(new Event("error"))
      return
    }
    this.error()
  }

  open(): void {
    this.readyState = 1
    this.onopen?.(new Event("open"))
  }

  removeEventListener(type: string, listener: FakeEventListener): void {
    const listeners = this.listeners.get(type)
    listeners?.delete(listener)
    if (listeners?.size === 0) this.listeners.delete(type)
  }
}

function frame(
  eventType: StreamSseFrame["event"],
  sequence: number,
  values: Record<string, unknown> = {},
): StreamSseFrame {
  const data = {
    eventType,
    id: `cursor-${sequence}`,
    sequence,
    ...(eventType === "delta"
      ? { delta: "fragment", deltaKind: "text", messageId: null, runId: "run-1", sessionId: "session-1" }
      : eventType === "reset"
        ? { asOfSequence: sequence, reason: "cursor-expired" }
        : eventType === "invalidate"
          ? { resourceId: "session-1", resourceType: "session", revision: 2 }
          : eventType === "run-completed"
            ? { messageId: null, runId: "run-1", sessionId: "session-1", sessionRevision: 2 }
            : {
                ...(eventType === "run-failed"
                  ? { failure: null }
                  : eventType === "run-cancelled"
                    ? { reason: "user-requested" }
                    : { reason: "api-restarted" }),
                runId: "run-1",
                sessionId: "session-1",
                sessionRevision: 2,
              }),
    ...values,
  }
  return { data, event: eventType, id: `cursor-${sequence}` } as StreamSseFrame
}

function frameEventCreate(input: StreamSseFrame): Event {
  const message = new Event(input.event) as Event & { data?: unknown; lastEventId?: unknown }
  message.data = JSON.stringify(input.data)
  message.lastEventId = input.id
  return message
}

function runSummary(
  runId: string,
  sessionId: string,
  lastSequence: number,
  status: "running" | "succeeded" | "failed" | "aborted" = "running",
) {
  return { lastSequence, partialText: `${runId}-partial`, runId, sessionId, status }
}

type ResetBootstrap = {
  activeRuns: RunActiveSummary[]
  asOfCursor: string
  lastEventId?: string
  resetCheckpoint: string
  resourceRevisions: EventFeedResourceRevision[]
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
      createResult(
        runSummary(
          input.runId,
          input.sessionId,
          input.reason === "reset" ? input.lastSequence : input.sessionRevision,
          input.reason === "run-checkpoint" ? "failed" : "running",
        ),
      ),
    resourceRevalidate: async (input) =>
      createResult({ resourceId: input.resourceId, resourceType: input.resourceType, revision: input.serverRevision }),
    sessionSnapshotLoad: async (input) => createResult(sessionSnapshot(input.sessionId, input.sessionRevision ?? 1)),
    sessionSnapshotReplace: async () => createResult(undefined),
    shellListBootstrap: async (input) =>
      createResult({
        asOfCursor: `cursor-after-${input.resetCheckpoint}`,
        activeRuns: [],
        resetCheckpoint: input.resetCheckpoint,
        resourceRevisions: [],
      }),
    visibleResources: () => [],
    ...overrides,
  }
}

function createFakeFeed(
  reconciliation: FeedOptions["reconciliation"] = callbacks(),
  overrides: Partial<Omit<FeedOptions, "bootstrap" | "eventSourceFactory" | "reconciliation" | "ownershipRegistry">> & {
    ownershipRegistry?: FeedOptions["ownershipRegistry"]
  } = {},
) {
  const sources: FakeEventSource[] = []
  const feed = eventFeedCreate({
    bootstrap: { asOfCursor: "cursor-0", lastEventId: "cursor-0" },
    eventSourceFactory: (url, sourceOptions) => {
      const source = new FakeEventSource(url, sourceOptions)
      sources.push(source)
      return source
    },
    ownershipRegistry: eventFeedOwnerRegistryCreate(),
    reconciliation,
    ...overrides,
  })
  const source = sources[0]
  if (source === undefined) throw new Error("The fake event source was not created.")
  return { feed, source, sources }
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

test("runs one authenticated transport, applies normal deltas, and demultiplexes parallel sessions", () => {
  const states: string[] = []
  const { feed, source } = createFakeFeed(undefined, { onStateChange: (state) => states.push(state.status) })

  expect(source.url).toBe("/api/events?after=cursor-0")
  expect(source.withCredentials).toBe(true)
  source.open()
  source.emit(frame("delta", 1, { runId: "run-a", sessionId: "session-a", delta: "a" }))
  source.emit(frame("delta", 2, { runId: "run-b", sessionId: "session-b", delta: "b" }))

  expect(feed.dataState.activeRuns.get("run-a")).toMatchObject({ partialText: "a", sessionId: "session-a" })
  expect(feed.dataState.activeRuns.get("run-b")).toMatchObject({ partialText: "b", sessionId: "session-b" })
  expect(feed.getUrl()).toBe("/api/events?after=cursor-2")
  expect(feed.getState()).toEqual(feed.dataState.status)
  expect(states).toEqual(["reconnecting", "connected", "connected", "connected"])
})

test("requires an opaque bootstrap cursor and only opens a cursorless feed explicitly", () => {
  const sources: FakeEventSource[] = []
  const baseOptions = {
    eventSourceFactory: (url: string, sourceOptions: { withCredentials: boolean }) => {
      const source = new FakeEventSource(url, sourceOptions)
      sources.push(source)
      return source
    },
    ownershipRegistry: eventFeedOwnerRegistryCreate(),
    reconciliation: callbacks(),
  }

  expect(() =>
    eventFeedCreate({
      ...baseOptions,
      bootstrap: { asOfCursor: "12" },
    }),
  ).toThrow()

  const fresh = eventFeedCreate({ ...baseOptions, bootstrap: { fresh: true } })
  expect(sources[0]?.url).toBe("/api/events")
  expect(fresh.dataState.status.status).toBe("reconnecting")
  fresh.close()
})

test("a reload attach folds the run-specific snapshot and reopens the feed after its cursor", () => {
  const sources: FakeEventSource[] = []
  const feed = eventFeedCreate({
    bootstrap: { fresh: true },
    eventSourceFactory: (url, sourceOptions) => {
      const source = new FakeEventSource(url, sourceOptions)
      sources.push(source)
      return source
    },
    ownershipRegistry: eventFeedOwnerRegistryCreate(),
    reconciliation: callbacks(),
  })

  // A fresh reload starts cursorless; the run snapshot supplies the attach point.
  expect(sources[0]?.url).toBe("/api/events")

  expect(
    feed.activeRunAttach({
      lastCursor: "cursor-12",
      lastSequence: 12,
      partialText: "hello world",
      runId: "run-a",
      sessionId: "session-a",
      status: "running",
    }),
  ).toMatchObject({ success: true })

  expect(sources).toHaveLength(2)
  expect(sources[0]?.closeCount).toBe(1)
  expect(sources[1]?.url).toBe("/api/events?after=cursor-12")
  expect(feed.dataState.activeRuns.get("run-a")).toMatchObject({
    lastSequence: 12,
    partialText: "hello world",
    phase: "active",
  })

  // Fragments the snapshot already folded are not applied twice.
  const reattached = sources[1]
  if (reattached === undefined) throw new Error("The reattached event source is missing.")
  reattached.open()
  reattached.emit(frame("delta", 12, { runId: "run-a", sessionId: "session-a", delta: "duplicate" }))
  expect(feed.dataState.activeRuns.get("run-a")?.partialText).toBe("hello world")

  reattached.emit(frame("delta", 13, { runId: "run-a", sessionId: "session-a", delta: "!" }))
  expect(feed.dataState.activeRuns.get("run-a")).toMatchObject({ lastSequence: 13, partialText: "hello world!" })
  feed.close()
})

test("an attach without a snapshot cursor keeps the existing feed connection", () => {
  const { feed, sources } = createFakeFeed()

  expect(
    feed.activeRunAttach({
      lastCursor: null,
      lastSequence: 0,
      partialText: "",
      runId: "run-a",
      sessionId: "session-a",
      status: "accepted",
    }),
  ).toMatchObject({ success: true })

  expect(sources).toHaveLength(1)
  expect(feed.getUrl()).toBe("/api/events?after=cursor-0")
  expect(feed.dataState.activeRuns.get("run-a")).toMatchObject({ lastSequence: 0, phase: "active" })
  feed.close()
})

test("keeps one EventSource through reconnecting errors and closes it exactly once", () => {
  const states: string[] = []
  const { feed, source, sources } = createFakeFeed(undefined, { onStateChange: (state) => states.push(state.status) })

  source.open()
  source.error()
  expect(feed.dataState.status.status).toBe("reconnecting")
  source.open()
  feed.close()
  feed.close()

  expect(sources).toHaveLength(1)
  expect(source.closeCount).toBe(1)
  expect(states).toEqual(["reconnecting", "connected", "reconnecting", "connected", "offline"])
  expect(feed.dataState.status.status).toBe("offline")
})

test("preserves partial state and cursor across a non-auth SSE disconnect and reopen", () => {
  const { feed, source, sources } = createFakeFeed()

  source.open()
  source.emit(frame("delta", 1, { delta: "partial" }))

  expect(feed.dataState.activeRuns.get("run-1")).toMatchObject({
    checkpoint: null,
    lastSequence: 1,
    partialText: "partial",
    phase: "active",
    terminalStatus: null,
  })
  expect(feed.dataState.asOfCursor).toBe("cursor-1")
  expect(feed.dataState.lastEventId).toBe("cursor-1")
  expect(feed.getUrl()).toBe("/api/events?after=cursor-1")

  source.error()

  expect(feed.getState().status).toBe("reconnecting")
  expect(feed.dataState.activeRuns.get("run-1")).toMatchObject({
    lastSequence: 1,
    partialText: "partial",
    phase: "active",
    terminalStatus: null,
  })
  expect(feed.getUrl()).toBe("/api/events?after=cursor-1")

  source.open()

  expect(feed.getState().status).toBe("connected")
  expect(feed.dataState.activeRuns.get("run-1")).toMatchObject({
    lastSequence: 1,
    partialText: "partial",
    phase: "active",
    terminalStatus: null,
  })
  expect(feed.getUrl()).toBe("/api/events?after=cursor-1")
  expect(sources).toHaveLength(1)
  feed.close()
})

test("ignores late events from a superseded source and handles the current terminal event once", async () => {
  const events: StreamSseFrame[] = []
  const sessionLoads: string[] = []
  const sessionReplacements: SessionSettledSnapshotResponse[] = []
  const {
    feed,
    source: previous,
    sources,
  } = createFakeFeed(
    callbacks({
      sessionSnapshotLoad: async (input) => {
        sessionLoads.push(input.sessionId)
        return createResult(sessionSnapshot(input.sessionId, 7))
      },
      sessionSnapshotReplace: async (snapshot) => {
        sessionReplacements.push(snapshot)
        return createResult(undefined)
      },
    }),
    { onEvent: (event) => events.push(event) },
  )

  previous.open()
  previous.emit(frame("delta", 1, { delta: "before" }))
  const previousDeltaListener = [...(previous.listeners.get("delta") ?? [])][0]
  const previousCompletionListener = [...(previous.listeners.get("run-completed") ?? [])][0]
  if (previousDeltaListener === undefined || previousCompletionListener === undefined)
    throw new Error("The previous EventSource listeners were not installed.")

  feed.reconnect()
  feed.online()
  const current = sources[1]
  if (current === undefined) throw new Error("The current EventSource was not created.")
  current.open()

  previousDeltaListener(frameEventCreate(frame("delta", 2, { delta: "late" })))
  previousCompletionListener(frameEventCreate(frame("run-completed", 3, { sessionRevision: 7 })))
  expect(feed.dataState.activeRuns.get("run-1")).toMatchObject({
    lastSequence: 1,
    partialText: "before",
    terminalStatus: null,
  })

  current.emit(frame("delta", 4, { delta: "current" }))
  expect(feed.dataState.activeRuns.get("run-1")).toMatchObject({
    lastSequence: 4,
    partialText: "beforecurrent",
    terminalStatus: null,
  })
  current.emit(frame("run-completed", 5, { sessionRevision: 7 }))
  await flush()

  expect(events.map((event) => event.data.sequence)).toEqual([1, 4, 5])
  expect(sessionLoads).toEqual(["session-1"])
  expect(sessionReplacements).toHaveLength(1)
  expect(feed.dataState.activeRuns.has("run-1")).toBe(false)
  feed.close()
})

test("suppresses retained EventSource callbacks after close", () => {
  const events: StreamSseFrame[] = []
  const errors: Result<unknown>[] = []
  const states: string[] = []
  let authenticationErrors = 0
  const { feed, source, sources } = createFakeFeed(undefined, {
    onAuthenticationError: () => {
      authenticationErrors += 1
    },
    onError: (result) => errors.push(result),
    onEvent: (event) => events.push(event),
    onStateChange: (state) => states.push(state.status),
  })

  source.open()
  const eventListener = [...(source.listeners.get("delta") ?? [])][0]
  const openListener = source.onopen
  const errorListener = source.onerror
  if (eventListener === undefined || openListener === null || errorListener === null)
    throw new Error("The fake EventSource callbacks were not installed.")

  feed.close()
  const closedDataState = feed.dataState
  const closedState = feed.getState()
  const closedUrl = feed.getUrl()
  const callbackCounts = {
    errors: errors.length,
    events: events.length,
    states: states.length,
  }

  const lateMessage = new Event("delta") as Event & { data?: unknown; lastEventId?: unknown }
  lateMessage.data = JSON.stringify(frame("delta", 2).data)
  lateMessage.lastEventId = "cursor-2"
  eventListener(lateMessage)
  openListener(new Event("open"))
  errorListener(new Event("error"))
  feed.close()

  expect(feed.getState()).toEqual(closedState)
  expect(feed.dataState).toEqual(closedDataState)
  expect(feed.getUrl()).toBe(closedUrl)
  expect(feed.getState().status).toBe("offline")
  expect(sources).toHaveLength(1)
  expect(source.closeCount).toBe(1)
  expect(errors).toHaveLength(callbackCounts.errors)
  expect(events).toHaveLength(callbackCounts.events)
  expect(states).toHaveLength(callbackCounts.states)
  expect(authenticationErrors).toBe(0)
})

test("closes the transport on offline and reopens after the retained cursor when online", () => {
  const { feed, source, sources } = createFakeFeed()

  source.open()
  source.emit(frame("invalidate", 4))
  expect(feed.getUrl()).toBe("/api/events?after=cursor-4")

  feed.offline()
  expect(source.closeCount).toBe(1)
  expect(feed.getUrl()).toBe("/api/events?after=cursor-4")
  expect(feed.getState().status).toBe("offline")

  feed.online()
  expect(sources).toHaveLength(2)
  expect(sources[1]?.url).toBe("/api/events?after=cursor-4")
  feed.online()
  expect(sources).toHaveLength(2)
  feed.close()
})

test("signs out after an expired authenticated EventSource reconnect receives 401", async () => {
  let currentTime = new Date("2026-08-23T00:00:00.000Z")
  const expiresAt = new Date(currentTime.getTime() + 1_000)
  const authRoot = createRoot((dispose) => ({
    dispose,
    state: authSessionStateCreate({
      fetcher: async () =>
        currentTime < expiresAt
          ? Response.json({
              authenticated: true,
              displayName: "Expired User",
              organizationId: "organization-1",
              token: "stale-token",
              userId: "user-1",
            })
          : Response.json({ error: { code: "unauthorized", message: "Authentication is required." } }, { status: 401 }),
    }),
  }))
  await flush()
  expect(authRoot.state.status()).toBe("signed-in")

  const { feed, source } = createFakeFeed(undefined, {
    onAuthenticationError: authRoot.state.signOut,
  })
  source.open()
  currentTime = expiresAt
  source.reconnect(401)

  expect(feed.getState().status).toBe("offline")
  expect(authRoot.state.status()).toBe("signed-out")
  expect(authRoot.state.displayName()).toBeUndefined()
  expect(authRoot.state.organizationId()).toBeUndefined()
  expect(authRoot.state.token()).toBeUndefined()
  expect(authRoot.state.userId()).toBeUndefined()
  authRoot.dispose()
})

test("replaces a completed session authoritatively and removes the live run", async () => {
  const calls: string[] = []
  const replacements: SessionSettledSnapshotResponse[] = []
  const { feed, source } = createFakeFeed(
    callbacks({
      sessionSnapshotLoad: async (input) => {
        calls.push(`session:${input.sessionId}`)
        return createResult(sessionSnapshot(input.sessionId, 7))
      },
      sessionSnapshotReplace: async (snapshot) => {
        replacements.push(snapshot)
        return createResult(undefined)
      },
    }),
  )
  source.open()
  source.emit(frame("delta", 1))
  source.emit(frame("run-completed", 2, { sessionRevision: 7 }))
  await flush()

  expect(calls).toEqual(["session:session-1"])
  expect(replacements).toHaveLength(1)
  expect(replacements[0]).toMatchObject({ settled: true, session: { id: "session-1" }, revision: 7 })
  expect(feed.dataState.activeRuns.has("run-1")).toBe(false)
  expect(feed.dataState.resourceRevisions.get("session:session-1")).toBe(7)
  expect(feed.getState().status).toBe("connected")
})

test("does not accept completion until the injected atomic session replacement succeeds", async () => {
  let replaceAllowed = false
  let replaceCalls = 0
  const { feed, source } = createFakeFeed(
    callbacks({
      sessionSnapshotReplace: async () => {
        replaceCalls += 1
        return replaceAllowed ? createResult(undefined) : createResultError("sessionReplace", "temporary failure")
      },
    }),
  )

  source.emit(frame("run-completed", 1, { sessionRevision: 7 }))
  await flush()
  expect(replaceCalls).toBe(1)
  expect(feed.dataState.activeRuns.get("run-1")).toMatchObject({ phase: "reconciling", superseded: true })

  replaceAllowed = true
  expect(await feed.retryReconciliation()).toMatchObject({ success: true })
  expect(feed.dataState.activeRuns.has("run-1")).toBe(false)
})

test("retains the previous feed state when reset reconciliation fails before its atomic commit", async () => {
  const errors: Result<unknown>[] = []
  const { feed, source } = createFakeFeed(
    callbacks({
      resourceRevalidate: async () => createResultError("resource", "temporary failure"),
      shellListBootstrap: async (input) =>
        createResult({
          activeRuns: [],
          asOfCursor: "cursor-after-reset",
          resetCheckpoint: input.resetCheckpoint,
          resourceRevisions: [{ resourceId: "session-1", resourceType: "session", revision: 9 }],
        }),
      visibleResources: () => [{ resourceId: "session-1", resourceType: "session" }],
    }),
    {
      initial: { resourceRevisions: [{ resourceId: "session-1", resourceType: "session", revision: 1 }] },
      onError: (result) => errors.push(result),
    },
  )

  source.emit(frame("reset", 1))
  await flush()

  expect(errors).not.toHaveLength(0)
  expect(feed.dataState.resourceRevisions.get("session:session-1")).toBe(1)
  expect(feed.dataState.asOfCursor).toBe("cursor-0")
  expect(feed.getState().status).toBe("reconciling")
})

test("closes before reset reconciliation, orders bootstrap-visible-active work, and reopens after its cursor", async () => {
  const order: string[] = []
  const { feed, source, sources } = createFakeFeed(
    callbacks({
      activeRunSnapshotLoad: async (input) => {
        order.push(`active:${input.runId}`)
        return createResult(
          runSummary(
            input.runId,
            input.sessionId,
            input.reason === "reset" ? input.lastSequence : input.sessionRevision,
          ),
        )
      },
      resourceRevalidate: async (input) => {
        order.push(`resource:${input.resourceId}`)
        return createResult({ resourceId: input.resourceId, resourceType: input.resourceType, revision: 5 })
      },
      shellListBootstrap: async (input) => {
        order.push("bootstrap")
        return createResult({
          activeRuns: [runSummary("run-reset", "session-reset", 12)],
          asOfCursor: "cursor-12",
          lastEventId: "cursor-12",
          resetCheckpoint: input.resetCheckpoint,
          resourceRevisions: [],
        })
      },
      visibleResources: () => {
        order.push("visible")
        return [{ resourceId: "session-visible", resourceType: "session" }]
      },
    }),
    {
      initial: { settledCacheKeys: ["settled-hidden"] },
    },
  )

  source.emit(frame("reset", 1, { asOfSequence: 11 }))
  expect(source.closeCount).toBe(1)
  expect(order).toEqual(["bootstrap"])
  expect(feed.getState().status).toBe("reconciling")
  await flush()

  expect(order).toEqual(["bootstrap", "visible", "resource:session-visible", "active:run-reset"])
  expect(sources).toHaveLength(2)
  expect(sources[1]?.url).toBe("/api/events?after=cursor-12")
  expect(feed.dataState.settledCacheKeys).toEqual(["settled-hidden"])
  expect(feed.dataState.activeRuns.get("run-reset")).toMatchObject({ sessionId: "session-reset" })
  expect(feed.getState().status).toBe("reconnecting")
})

test("replaces reset resource metadata and authoritatively replaces sessions for succeeded discovered runs", async () => {
  const sessionCalls: Array<{ resetDiscovered?: boolean; sessionId: string }> = []
  const { feed, source } = createFakeFeed(
    callbacks({
      activeRunSnapshotLoad: async (input) =>
        createResult(
          runSummary(
            input.runId,
            input.sessionId,
            input.reason === "reset" ? input.lastSequence : input.sessionRevision,
            input.reason === "reset" ? "succeeded" : "running",
          ),
        ),
      resourceRevalidate: async () => createResult(null),
      sessionSnapshotLoad: async (input) => {
        sessionCalls.push({
          resetDiscovered: "resetDiscovered" in input ? input.resetDiscovered : undefined,
          sessionId: input.sessionId,
        })
        return createResult(sessionSnapshot(input.sessionId, 9))
      },
      shellListBootstrap: async (input) =>
        createResult({
          activeRuns: [runSummary("run-reset", "session-reset", 12)],
          asOfCursor: "opaque-after-reset",
          resetCheckpoint: input.resetCheckpoint,
          resourceRevisions: [{ resourceId: "session-new", resourceType: "session", revision: 8 }],
        }),
      visibleResources: () => [],
    }),
    { initial: { resourceRevisions: [{ resourceId: "session-old", resourceType: "session", revision: 3 }] } },
  )

  source.emit(frame("reset", 1))
  await flush()

  expect(sessionCalls).toEqual([{ resetDiscovered: true, sessionId: "session-reset" }])
  expect(feed.dataState.resourceRevisions.get("session:session-old")).toBeUndefined()
  expect(feed.dataState.resourceRevisions.get("session:session-new")).toBe(8)
  expect(feed.dataState.activeRuns.has("run-reset")).toBe(false)
  expect(feed.getUrl()).toBe("/api/events?after=opaque-after-reset")
})

test("does not commit a resource callback from before reset", async () => {
  let resolveResource: ((result: Result<EventFeedResourceRevision | null>) => void) | undefined
  const resourceResult = new Promise<Result<EventFeedResourceRevision | null>>((resolve) => {
    resolveResource = resolve
  })
  const { feed, source } = createFakeFeed(
    callbacks({
      resourceRevalidate: () => resourceResult,
      shellListBootstrap: async (input) =>
        createResult({
          activeRuns: [],
          asOfCursor: "opaque-after-reset",
          resetCheckpoint: input.resetCheckpoint,
          resourceRevisions: [],
        }),
      visibleResources: () => [],
    }),
    { initial: { resourceRevisions: [{ resourceId: "session-1", resourceType: "session", revision: 1 }] } },
  )

  source.emit(frame("invalidate", 1, { revision: 2 }))
  source.emit(frame("reset", 2))
  await flush()
  resolveResource?.(createResult({ resourceId: "session-1", resourceType: "session", revision: 99 }))
  await flush()

  expect(feed.dataState.resourceRevisions.get("session:session-1")).toBeUndefined()
  expect(feed.getUrl()).toBe("/api/events?after=opaque-after-reset")
})

test("does not reopen when reset bootstrap is bound to another checkpoint", async () => {
  const errors: Result<unknown>[] = []
  const { feed, source, sources } = createFakeFeed(
    callbacks({
      shellListBootstrap: async () =>
        createResult({
          activeRuns: [],
          asOfCursor: "opaque-after-reset",
          resetCheckpoint: "another-reset-checkpoint",
          resourceRevisions: [],
        } as never),
    }),
    { onError: (result) => errors.push(result) },
  )

  source.emit(frame("reset", 1))
  await flush()

  expect(sources).toHaveLength(1)
  expect(feed.getState().status).toBe("reconciling")
  expect(errors.length).toBeGreaterThan(0)
})

test("does not let a reset retry reopen after close wins the race", async () => {
  let bootstrapAttempts = 0
  let resolveRetryBootstrap: ((result: Result<ResetBootstrap>) => void) | undefined
  const retryBootstrap = new Promise<Result<ResetBootstrap>>((resolve) => {
    resolveRetryBootstrap = resolve
  })
  const { feed, source, sources } = createFakeFeed(
    callbacks({
      shellListBootstrap: async (_input) => {
        bootstrapAttempts += 1
        if (bootstrapAttempts === 1) return createResultError("bootstrap", "temporary failure")
        return retryBootstrap
      },
    }),
  )

  source.emit(frame("reset", 1))
  await flush()
  const retry = feed.retryReconciliation()
  await flush()
  feed.close()
  resolveRetryBootstrap?.(
    createResult({
      activeRuns: [],
      asOfCursor: "cursor-after-reset",
      resetCheckpoint: "cursor-1",
      resourceRevisions: [],
    }),
  )
  await retry

  expect(bootstrapAttempts).toBe(2)
  expect(sources).toHaveLength(1)
  expect(feed.getState().status).toBe("offline")
})

test("leaves a failed lifecycle reconciliation pending until a manual retry succeeds", async () => {
  let attempts = 0
  const { feed, source } = createFakeFeed(
    callbacks({
      activeRunSnapshotLoad: async (input) => {
        attempts += 1
        if (attempts === 1) return createResultError("fake", "temporary failure")
        return createResult(runSummary(input.runId, input.sessionId, 4, "failed"))
      },
    }),
  )
  source.open()

  source.emit(frame("run-failed", 1, { sessionRevision: 4 }))
  await flush()
  expect(attempts).toBe(1)
  expect(feed.getState().status).toBe("reconciling")

  expect(await feed.retryReconciliation()).toMatchObject({ success: true })
  expect(attempts).toBe(2)
  expect(feed.dataState.activeRuns.get("run-1")).toMatchObject({ phase: "settled", terminalStatus: "failed" })
  expect(feed.getState().status).toBe("connected")
})

test("serializes concurrent manual reconciliation retries", async () => {
  let attempts = 0
  let resolveRetry: ((result: Result<RunActiveSummary>) => void) | undefined
  const retryResult = new Promise<Result<RunActiveSummary>>((resolve) => {
    resolveRetry = resolve
  })
  const { feed, source } = createFakeFeed(
    callbacks({
      activeRunSnapshotLoad: async (input) => {
        attempts += 1
        if (attempts === 1) return createResultError("fake", "temporary failure")
        if (attempts === 2) return retryResult
        return createResult(runSummary(input.runId, input.sessionId, 4, "failed"))
      },
    }),
  )
  source.open()
  source.emit(frame("run-failed", 1, { sessionRevision: 4 }))
  await flush()

  const firstRetry = feed.retryReconciliation()
  await flush()
  const secondRetry = feed.retryReconciliation()
  await flush()
  expect(attempts).toBe(2)

  resolveRetry?.(createResult(runSummary("run-1", "session-1", 4, "failed")))
  await Promise.all([firstRetry, secondRetry])
  expect(attempts).toBe(2)
})

test("revalidates only newer invalidations and exposes stale while the request is pending", async () => {
  let resolve: ((result: Result<EventFeedResourceRevision | null>) => void) | undefined
  const pending = new Promise<Result<EventFeedResourceRevision | null>>((done) => {
    resolve = done
  })
  const calls: number[] = []
  const { feed, source } = createFakeFeed(
    callbacks({
      resourceRevalidate: (input) => {
        calls.push(input.serverRevision)
        return pending
      },
    }),
    { initial: { resourceRevisions: [{ resourceId: "session-1", resourceType: "session", revision: 2 }] } },
  )

  source.open()
  source.emit(frame("invalidate", 1, { revision: 3 }))
  expect(feed.getState().status).toBe("stale")
  source.emit(frame("invalidate", 2, { revision: 2 }))
  expect(calls).toEqual([3])
  resolve?.(createResult({ resourceId: "session-1", resourceType: "session", revision: 3 }))
  await flush()
  expect(feed.getState().status).toBe("connected")
})

test("does not reopen after close while reset callbacks are in flight", async () => {
  let completeBootstrap: ((result: Result<ResetBootstrap>) => void) | undefined
  const bootstrap = new Promise<Result<ResetBootstrap>>((resolve) => {
    completeBootstrap = resolve
  })
  const { feed, source, sources } = createFakeFeed(
    callbacks({
      shellListBootstrap: () => bootstrap,
    }),
  )

  source.emit(frame("reset", 1))
  feed.close()
  completeBootstrap?.(
    createResult({
      asOfCursor: "cursor-2",
      lastEventId: "cursor-2",
      resetCheckpoint: "cursor-1",
      resourceRevisions: [],
      activeRuns: [],
    }),
  )
  await flush()

  expect(feed.getState().status).toBe("offline")
  expect(sources).toHaveLength(1)
})

test("does not commit resource work after close", async () => {
  let resolveResource: ((result: Result<EventFeedResourceRevision | null>) => void) | undefined
  const resourceResult = new Promise<Result<EventFeedResourceRevision | null>>((resolve) => {
    resolveResource = resolve
  })
  const { feed, source } = createFakeFeed(callbacks({ resourceRevalidate: () => resourceResult }), {
    initial: { resourceRevisions: [{ resourceId: "session-1", resourceType: "session", revision: 1 }] },
  })

  source.emit(frame("invalidate", 1, { revision: 2 }))
  feed.close()
  resolveResource?.(createResult({ resourceId: "session-1", resourceType: "session", revision: 9 }))
  await flush()

  expect(feed.dataState.resourceRevisions.get("session:session-1")).toBe(1)
  expect(feed.dataState.status.status).toBe("offline")
})

test("enforces one feed owner per injected registry and permits isolated registries", () => {
  const registry = eventFeedOwnerRegistryCreate()
  const first = createFakeFeed(callbacks(), { ownershipRegistry: registry })
  expect(() => createFakeFeed(callbacks(), { ownershipRegistry: registry })).toThrow()

  first.feed.close()
  const second = createFakeFeed(callbacks(), { ownershipRegistry: registry })
  second.feed.close()

  const isolatedA = createFakeFeed()
  const isolatedB = createFakeFeed()
  isolatedA.feed.close()
  isolatedB.feed.close()
})

test("does not duplicate reset work for repeated reset frames", async () => {
  let bootstrapCalls = 0
  let resolveBootstrap: ((result: Result<ResetBootstrap>) => void) | undefined
  const bootstrap = new Promise<Result<ResetBootstrap>>((resolve) => {
    resolveBootstrap = resolve
  })
  const { feed, source, sources } = createFakeFeed(
    callbacks({
      shellListBootstrap: () => {
        bootstrapCalls += 1
        return bootstrap
      },
    }),
  )

  source.emit(frame("reset", 1))
  source.emit(frame("reset", 2))
  await flush()
  expect(bootstrapCalls).toBe(1)

  resolveBootstrap?.(
    createResult({
      activeRuns: [],
      asOfCursor: "cursor-after-reset",
      resetCheckpoint: "cursor-1",
      resourceRevisions: [],
    }),
  )
  await flush()
  expect(sources).toHaveLength(2)
  expect(sources[1]?.url).toBe("/api/events?after=cursor-after-reset")
  feed.close()
})

test("close during a reset snapshot prevents replacement and reopen", async () => {
  let resolveSnapshot: ((result: Result<SessionSettledSnapshotResponse>) => void) | undefined
  const snapshot = new Promise<Result<SessionSettledSnapshotResponse>>((resolve) => {
    resolveSnapshot = resolve
  })
  let replaceCalls = 0
  const { feed, source, sources } = createFakeFeed(
    callbacks({
      activeRunSnapshotLoad: async (input) => createResult(runSummary(input.runId, input.sessionId, 4, "succeeded")),
      sessionSnapshotLoad: () => snapshot,
      sessionSnapshotReplace: async () => {
        replaceCalls += 1
        return createResult(undefined)
      },
      shellListBootstrap: async (input) =>
        createResult({
          activeRuns: [runSummary("run-reset", "session-reset", 4)],
          asOfCursor: "cursor-after-reset",
          resetCheckpoint: input.resetCheckpoint,
          resourceRevisions: [],
        }),
    }),
  )

  source.emit(frame("reset", 1))
  await flush()
  feed.close()
  resolveSnapshot?.(createResult(sessionSnapshot("session-reset", 9)))
  await flush()

  expect(replaceCalls).toBe(0)
  expect(sources).toHaveLength(1)
  expect(feed.getState().status).toBe("offline")
  expect(feed.getState()).toEqual(feed.dataState.status)
})

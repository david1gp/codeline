import { expect, test } from "bun:test"
import { createResult } from "@adaptive-ds/result"
import { eventFeedCreate } from "../src/events/client/eventFeedCreate.js"
import { eventFeedOwnerRegistryCreate } from "../src/events/client/eventFeedOwnerRegistryCreate.js"
import type { GlobalSummarySseFrame } from "../src/stream/api/globalSummarySseFrameSchema.js"
import type { StreamEventSourceError } from "../src/stream/client/streamEventSourceError.js"
import type { StreamEventSourceEvent } from "../src/stream/client/streamEventSourceEvent.js"

type FakeListener = (event: StreamEventSourceEvent) => void
type FeedOptions = Parameters<typeof eventFeedCreate>[0]

class FakeEventSource {
  readonly listeners = new Map<string, Set<FakeListener>>()
  readonly url: string
  closeCount = 0
  onerror: ((error?: StreamEventSourceError) => void) | null = null
  onopen: (() => void) | null = null
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
    const event = { data: JSON.stringify(frame.data), lastEventId: frame.id }
    for (const listener of [...(this.listeners.get(frame.event) ?? [])]) listener(event)
  }

  error(status?: number, readyState = 2): void {
    this.readyState = readyState
    this.onerror?.(status === undefined ? {} : { status })
  }

  open(): void {
    this.readyState = 1
    this.onopen?.()
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

function callbacks(overrides: Partial<FeedOptions["reconciliation"]> = {}): FeedOptions["reconciliation"] {
  return {
    resourceRevalidate: async (input) =>
      createResult({ resourceId: input.resourceId, resourceType: input.resourceType, revision: input.serverRevision }),
    shellListBootstrap: async (input) =>
      createResult({
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
  source.emit(frame("run-completed", 2))
  await flush()

  expect(events.map((event) => event.data.globalSequence)).toEqual([1, 2])
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

test("global feed reports authentication failure only after the session confirms unauthorized", async () => {
  let authenticationErrors = 0
  const registry = eventFeedOwnerRegistryCreate()
  const first = feedCreate({
    fetch: async () => new Response(null, { status: 401 }),
    onAuthenticationError: () => {
      authenticationErrors += 1
    },
    ownershipRegistry: registry,
  })
  expect(() => feedCreate({ ownershipRegistry: registry })).toThrow()
  first.source.error()
  await flush()
  expect(authenticationErrors).toBe(1)
  expect(first.feed.getState().status).toBe("offline")
  first.feed.close()
})

test("a CLOSED cursor failure reconciles authoritatively before attaching a fresh feed", async () => {
  const authenticationRequests: string[] = []
  let authenticationErrors = 0
  const resetCheckpoints: string[] = []
  const { feed, source, sources } = feedCreate({
    fetch: async (input) => {
      authenticationRequests.push(String(input))
      return Response.json({ authenticated: true, displayName: "User One", userId: "user-1" })
    },
    onAuthenticationError: () => {
      authenticationErrors += 1
    },
    reconciliation: callbacks({
      shellListBootstrap: async (input) => {
        resetCheckpoints.push(input.resetCheckpoint)
        return createResult({
          asOfCursor: "cursor-after-reset",
          resetCheckpoint: input.resetCheckpoint,
          resourceRevisions: [],
        })
      },
    }),
  })

  source.error()
  await flush()

  expect(authenticationRequests).toEqual(["/api/auth/session"])
  expect(authenticationErrors).toBe(0)
  expect(resetCheckpoints).toEqual(["cursor-0"])
  expect(sources[1]?.url).toBe("/api/events?after=cursor-after-reset")
  feed.close()
})

test("reports source creation and listener installation failures without browser APIs", () => {
  const errors: string[] = []
  const sourceCreationFailure = eventFeedCreate({
    bootstrap: { fresh: true },
    eventSourceFactory: () => {
      throw new Error("source unavailable")
    },
    onError: (result) => {
      if (!result.success) errors.push(result.errorMessage)
    },
    ownershipRegistry: eventFeedOwnerRegistryCreate(),
    reconciliation: callbacks(),
  })

  expect(sourceCreationFailure.getState().status).toBe("offline")
  expect(errors).toEqual(["The event source could not be created."])
  sourceCreationFailure.close()

  const listenerFailure = eventFeedCreate({
    bootstrap: { fresh: true },
    eventSourceFactory: () => ({
      addEventListener: () => {
        throw new Error("listener unavailable")
      },
      close: () => undefined,
      onerror: null,
      onopen: null,
      removeEventListener: () => undefined,
    }),
    onError: (result) => {
      if (!result.success) errors.push(result.errorMessage)
    },
    ownershipRegistry: eventFeedOwnerRegistryCreate(),
    reconciliation: callbacks(),
  })

  expect(listenerFailure.getState().status).toBe("offline")
  expect(errors).toEqual([
    "The event source could not be created.",
    "The event source listeners could not be installed.",
  ])
  listenerFailure.close()
})

test("closes the injected source once and ignores events after closure", () => {
  const events: GlobalSummarySseFrame[] = []
  const { feed, source } = feedCreate({ onEvent: (event) => events.push(event) })

  feed.close()
  feed.close()
  source.emit(frame("run-started", 1))

  expect(source.closeCount).toBe(1)
  expect(events).toEqual([])
})

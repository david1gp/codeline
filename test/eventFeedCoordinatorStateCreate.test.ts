import { expect, test } from "bun:test"
import { createResult } from "@adaptive-ds/result"
import type { RunActiveSummary } from "../src/run/api/runActiveSummarySchema.js"
import type { SessionSettledSnapshotResponse } from "../src/session/api/sessionSettledSnapshotResponseSchema.js"
import type { StreamSseFrame } from "../src/stream/api/streamSseFrameSchema.js"
import { eventFeedCoordinatorStateCreate } from "../src/ui/eventFeedCoordinatorStateCreate.js"

type CoordinatorOptions = Parameters<typeof eventFeedCoordinatorStateCreate>[0]
type CoordinatorReconciliation = CoordinatorOptions["reconciliation"]
type FakeEventListener = (event: Event) => void

class FakeEventSource {
  readonly listeners = new Map<string, Set<FakeEventListener>>()
  readonly url: string
  closeCount = 0
  onerror: ((event: Event) => void) | null = null
  onopen: ((event: Event) => void) | null = null
  readyState = 0

  constructor(url: string) {
    this.url = url
  }

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<FakeEventListener>()
    listeners.add(listener as FakeEventListener)
    this.listeners.set(type, listeners)
  }

  close(): void {
    this.closeCount += 1
    this.readyState = 2
  }

  emit(frame: StreamSseFrame): void {
    const message = new Event(frame.event) as Event & { data?: string; lastEventId?: string }
    message.data = JSON.stringify(frame.data)
    message.lastEventId = frame.id
    for (const listener of [...(this.listeners.get(frame.event) ?? [])]) listener(message)
  }

  open(): void {
    this.readyState = 1
    this.onopen?.(new Event("open"))
  }

  removeEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type)
    listeners?.delete(listener as FakeEventListener)
    if (listeners?.size === 0) this.listeners.delete(type)
  }
}

function sessionSnapshot(sessionId: string): SessionSettledSnapshotResponse {
  const timestamp = "2026-01-01T00:00:00.000Z"
  return {
    asOfCursor: "cursor-1",
    asOfSequence: 1,
    etag: '"session-1"',
    messages: [],
    revision: 1,
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
      revision: 1,
      serverId: "server-1",
      title: sessionId,
      updatedAt: timestamp,
    },
    settled: true,
  }
}

function runSummary(): RunActiveSummary {
  return { lastSequence: 1, partialText: "", runId: "run-1", sessionId: "session-1", status: "running" }
}

function reconciliation(overrides: Partial<CoordinatorReconciliation> = {}): CoordinatorReconciliation {
  return {
    activeRunSnapshotLoad: () => createResult(runSummary()),
    resourceRevalidate: (input) =>
      createResult({ resourceId: input.resourceId, resourceType: input.resourceType, revision: input.serverRevision }),
    sessionSnapshotLoad: (input) => createResult(sessionSnapshot(input.sessionId)),
    sessionSnapshotReplace: () => createResult(undefined),
    shellListBootstrap: (input) =>
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

function frame(
  eventType: StreamSseFrame["event"],
  sequence: number,
  values: Record<string, unknown> = {},
): StreamSseFrame {
  const data = {
    eventType,
    id: `cursor-${sequence}`,
    sequence,
    ...(eventType === "reset"
      ? { asOfSequence: sequence, reason: "cursor-expired" }
      : eventType === "invalidate"
        ? { resourceId: "session-1", resourceType: "session", revision: sequence }
        : eventType === "delta"
          ? { delta: "fragment", deltaKind: "text", messageId: null, runId: "run-1", sessionId: "session-1" }
          : { runId: "run-1", sessionId: "session-1", sessionRevision: sequence, reason: "test" }),
    ...values,
  }
  return { data, event: eventType, id: `cursor-${sequence}` } as StreamSseFrame
}

function coordinatorCreate(overrides: Partial<CoordinatorOptions> = {}): {
  coordinator: ReturnType<typeof eventFeedCoordinatorStateCreate>
  source: FakeEventSource
  sources: FakeEventSource[]
} {
  const sources: FakeEventSource[] = []
  const coordinator = eventFeedCoordinatorStateCreate({
    bootstrap: { asOfCursor: "cursor-0", lastEventId: "cursor-0" },
    connectionIndicator: { statusSet: () => undefined },
    eventSourceFactory: (url) => {
      const source = new FakeEventSource(url)
      sources.push(source)
      return source
    },
    reconciliation: reconciliation(),
    ...overrides,
  })
  const source = sources[0]
  if (source === undefined) throw new Error("The fake event source was not created.")
  return { coordinator, source, sources }
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

test("forwards transport status changes to the tab connection indicator", () => {
  const statuses: string[] = []
  const { coordinator, source } = coordinatorCreate({
    connectionIndicator: { statusSet: (status) => statuses.push(status.status) },
  })

  expect(statuses).toEqual(["reconnecting"])
  source.open()
  expect(statuses).toEqual(["reconnecting", "connected"])
  coordinator.close()
  expect(statuses.at(-1)).toBe("offline")
})

test("reopens the feed and refreshes registered state once when connectivity returns", async () => {
  const calls: string[] = []
  let releaseSessionRefresh: (() => void) | undefined
  const statuses: string[] = []
  const sessionRefresh = new Promise<void>((resolve) => {
    releaseSessionRefresh = resolve
  })
  const { coordinator, source, sources } = coordinatorCreate({
    connectionIndicator: { statusSet: (status) => statuses.push(status.status) },
  })
  coordinator.registerSessionList(async () => {
    calls.push("session-list")
    await sessionRefresh
  })
  coordinator.registerSelectedSession({
    sessionId: "session-1",
    refresh: () => {
      calls.push("session")
    },
  })
  coordinator.registerSelectedMessages({
    sessionId: "session-1",
    refresh: () => {
      calls.push("messages")
    },
  })
  coordinator.registerSelectedDelegations({
    sessionId: "session-1",
    refresh: () => {
      calls.push("delegations")
    },
  })
  coordinator.registerSelectedStream({
    sessionId: "session-1",
    refresh: () => {
      calls.push("stream")
    },
  })
  coordinator.registerNoteList(() => {
    calls.push("note-list")
  })
  coordinator.registerNoteDetail({
    noteId: "note-1",
    refresh: () => {
      calls.push("note-detail")
    },
  })

  source.open()
  coordinator.offline()
  const firstRecovery = coordinator.online()
  const secondRecovery = coordinator.online()

  expect(secondRecovery).toBe(firstRecovery)
  expect(sources).toHaveLength(1)
  expect(source.closeCount).toBe(1)
  expect(statuses.at(-1)).toBe("reconnecting")
  expect(calls).toEqual(["session-list"])

  releaseSessionRefresh?.()
  expect(await firstRecovery).toMatchObject({ success: true })
  expect(sources).toHaveLength(2)
  expect(sources[1]?.url).toBe("/api/events?after=cursor-0")
  expect(calls).toEqual(["session-list", "session", "messages", "delegations", "stream", "note-list", "note-detail"])
  coordinator.close()
})

test("enforces one owner for a tab registry and releases it through cleanup", () => {
  const first = coordinatorCreate()
  expect(() => coordinatorCreate()).toThrow()

  first.coordinator.eventFeed.cleanup()
  const second = coordinatorCreate()
  second.coordinator.close()
})

test("routes resource invalidations to the matching registered refresh seams", async () => {
  const calls: string[] = []
  const { coordinator, source } = coordinatorCreate()
  coordinator.registerSessionList(() => {
    calls.push("session-list")
  })
  coordinator.registerSelectedSession({
    sessionId: "session-1",
    refresh: () => {
      calls.push("session")
    },
  })
  coordinator.registerSelectedMessages({
    sessionId: "session-1",
    refresh: () => {
      calls.push("messages")
    },
  })
  coordinator.registerSelectedDelegations({
    sessionId: "session-1",
    refresh: () => {
      calls.push("delegations")
    },
  })
  coordinator.registerSelectedStream({
    sessionId: "session-1",
    refresh: () => {
      calls.push("stream")
    },
  })
  coordinator.registerNoteList(() => {
    calls.push("note-list")
  })
  coordinator.registerNoteDetail({
    noteId: "note-1",
    refresh: () => {
      calls.push("note-detail")
    },
  })

  source.emit(frame("invalidate", 1, { resourceId: "session-1", resourceType: "session" }))
  await flush()
  expect(calls).toEqual(["session-list", "session", "messages", "delegations", "stream"])

  source.emit(frame("invalidate", 2, { resourceId: "note-1", resourceType: "note" }))
  await flush()
  expect(calls).toEqual(["session-list", "session", "messages", "delegations", "stream", "note-list", "note-detail"])

  coordinator.unregisterNoteDetail({ noteId: "note-1", refresh: () => undefined })
  coordinator.close()
})

test("refreshes every active seam once during reset bootstrap", async () => {
  const calls: string[] = []
  const { coordinator, source, sources } = coordinatorCreate()
  coordinator.registerSessionList(() => {
    calls.push("session-list")
  })
  coordinator.registerSelectedSession({
    sessionId: "session-1",
    refresh: () => {
      calls.push("session")
    },
  })
  coordinator.registerSelectedMessages({
    sessionId: "session-1",
    refresh: () => {
      calls.push("messages")
    },
  })
  coordinator.registerSelectedDelegations({
    sessionId: "session-1",
    refresh: () => {
      calls.push("delegations")
    },
  })
  coordinator.registerSelectedStream({
    sessionId: "session-1",
    refresh: () => {
      calls.push("stream")
    },
  })
  coordinator.registerNoteList(() => {
    calls.push("note-list")
  })
  coordinator.registerNoteDetail({
    noteId: "note-1",
    refresh: () => {
      calls.push("note-detail")
    },
  })

  source.emit(frame("reset", 1))
  await flush()

  expect(calls).toEqual(["session-list", "session", "messages", "delegations", "stream", "note-list", "note-detail"])
  expect(sources).toHaveLength(2)
  coordinator.close()
})

test("unregisters and cleans refresh seams so closed feeds cannot route later events", async () => {
  let refreshCount = 0
  const { coordinator, source } = coordinatorCreate()
  const unregister = coordinator.registerSessionList(() => {
    refreshCount += 1
  })
  unregister()
  source.emit(frame("invalidate", 1, { resourceId: "session-1", resourceType: "session-list" }))
  await flush()
  expect(refreshCount).toBe(0)

  coordinator.registerSessionList(() => {
    refreshCount += 1
  })
  coordinator.close()
  source.emit(frame("invalidate", 2, { resourceId: "session-1", resourceType: "session-list" }))
  await flush()
  expect(refreshCount).toBe(0)
})

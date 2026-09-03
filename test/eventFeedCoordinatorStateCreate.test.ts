import { expect, test } from "bun:test"
import { createResult } from "@adaptive-ds/result"
import type { GlobalSummarySseFrame } from "../src/stream/api/globalSummarySseFrameSchema.js"
import type { StreamEventSourceEvent } from "../src/stream/client/streamEventSourceEvent.js"
import { eventFeedCoordinatorStateCreate } from "../src/ui/eventFeedCoordinatorStateCreate.js"

type CoordinatorOptions = Parameters<typeof eventFeedCoordinatorStateCreate>[0]
type CoordinatorReconciliation = CoordinatorOptions["reconciliation"]
type FakeEventListener = (event: StreamEventSourceEvent) => void

class FakeEventSource {
  readonly listeners = new Map<string, Set<FakeEventListener>>()
  readonly url: string
  closeCount = 0
  onerror: (() => void) | null = null
  onopen: (() => void) | null = null
  readyState = 0

  constructor(url: string) {
    this.url = url
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

  emit(frame: GlobalSummarySseFrame): void {
    const message = { data: JSON.stringify(frame.data), lastEventId: frame.id }
    for (const listener of [...(this.listeners.get(frame.event) ?? [])]) listener(message)
  }

  open(): void {
    this.readyState = 1
    this.onopen?.()
  }

  removeEventListener(type: string, listener: FakeEventListener): void {
    const listeners = this.listeners.get(type)
    listeners?.delete(listener)
    if (listeners?.size === 0) this.listeners.delete(type)
  }
}

function reconciliation(overrides: Partial<CoordinatorReconciliation> = {}): CoordinatorReconciliation {
  return {
    resourceRevalidate: (input) =>
      createResult({ resourceId: input.resourceId, resourceType: input.resourceType, revision: input.serverRevision }),
    shellListBootstrap: (input) =>
      createResult({
        asOfCursor: "cursor-after-reset",
        resetCheckpoint: input.resetCheckpoint,
        resourceRevisions: [],
      }),
    visibleResources: () => [],
    ...overrides,
  }
}

function frame(
  eventType: GlobalSummarySseFrame["event"],
  sequence: number,
  values: Record<string, unknown> = {},
): GlobalSummarySseFrame {
  const data = {
    eventType,
    id: `cursor-${sequence}`,
    globalSequence: sequence,
    ...(eventType === "reset"
      ? { asOfGlobalSequence: sequence, reason: "cursor-expired" }
      : eventType === "invalidate"
        ? { resourceId: "session-1", resourceType: "session", revision: sequence }
        : eventType === "run-completed"
          ? {
              changePosition: sequence,
              messageId: null,
              runId: "run-1",
              sessionId: "session-1",
              sessionRevision: sequence,
            }
          : eventType === "run-started"
            ? { runId: "run-1", sessionId: "session-1" }
            : eventType === "input-needed"
              ? {
                  requestId: "request-1",
                  runId: "run-1",
                  sessionId: "session-1",
                  sessionRevision: sequence,
                }
              : eventType === "run-failed"
                ? {
                    changePosition: sequence,
                    failure: null,
                    runId: "run-1",
                    sessionId: "session-1",
                    sessionRevision: sequence,
                  }
                : {
                    changePosition: sequence,
                    runId: "run-1",
                    sessionId: "session-1",
                    sessionRevision: sequence,
                    reason: "test",
                  }),
    ...values,
  }
  return { data, event: eventType, id: `cursor-${sequence}` } as GlobalSummarySseFrame
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
  coordinator.registerSelectedDelegations({
    sessionId: "session-1",
    refresh: () => {
      calls.push("delegations")
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
  expect(calls).toEqual(["session-list", "session", "delegations", "note-list", "note-detail"])
  coordinator.close()
})

test("waits for the selected snapshot refresh before reopening during normal recovery", async () => {
  let releaseSelectedRefresh: (() => void) | undefined
  let selectedRefreshCount = 0
  const selectedRefresh = new Promise<void>((resolve) => {
    releaseSelectedRefresh = resolve
  })
  const { coordinator, source, sources } = coordinatorCreate()
  coordinator.registerSelectedSession({
    refresh: async () => {
      selectedRefreshCount += 1
      await selectedRefresh
    },
    sessionId: "session-1",
  })

  source.open()
  coordinator.offline()
  const recovery = coordinator.online()
  await flush()

  expect(selectedRefreshCount).toBe(1)
  expect(sources).toHaveLength(1)
  expect(coordinator.eventFeed.selectedDetailEnabled()).toBe(false)

  releaseSelectedRefresh?.()
  expect(await recovery).toMatchObject({ success: true })
  expect(sources).toHaveLength(2)
  expect(coordinator.eventFeed.selectedDetailEnabled()).toBe(true)
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
  coordinator.registerSelectedDelegations({
    sessionId: "session-1",
    refresh: () => {
      calls.push("delegations")
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
  expect(calls).toEqual(["session-list", "delegations"])

  source.emit(frame("invalidate", 2, { resourceId: "note-1", resourceType: "note" }))
  await flush()
  expect(calls).toEqual(["session-list", "delegations", "note-list", "note-detail"])

  coordinator.unregisterNoteDetail({ noteId: "note-1", refresh: () => undefined })
  coordinator.close()
})

test("does not reload the selected bounded snapshot for detail-bearing global invalidations", async () => {
  const calls: string[] = []
  const { coordinator, source } = coordinatorCreate()
  coordinator.registerSelectedSession({
    refresh: () => {
      calls.push("snapshot")
    },
    sessionId: "session-1",
  })
  coordinator.registerSessionList(() => {
    calls.push("session-list")
  })
  coordinator.registerSelectedDelegations({
    refresh: () => {
      calls.push("delegations")
    },
    sessionId: "session-1",
  })

  source.emit(frame("invalidate", 1, { resourceId: "session-1", resourceType: "session" }))
  await flush()
  expect(calls).toEqual(["session-list", "delegations"])

  source.emit(frame("invalidate", 2, { resourceId: "message-1", resourceType: "message" }))
  await flush()
  expect(calls).toEqual(["session-list", "delegations"])
  coordinator.close()
})

test("deduplicates one callback registered across selected refresh scopes", async () => {
  let refreshCount = 0
  const refresh = () => {
    refreshCount += 1
  }
  const { coordinator, source } = coordinatorCreate()
  coordinator.registerSelectedSession({ refresh, sessionId: "session-1" })
  coordinator.registerSelectedDelegations({ refresh, sessionId: "session-1" })

  source.emit(frame("reset", 1))
  await flush()

  expect(refreshCount).toBe(1)
  coordinator.close()
})

test("keeps message and run invalidations on their owning selected seams", async () => {
  const calls: string[] = []
  const { coordinator, source } = coordinatorCreate()
  coordinator.registerSelectedSession({
    refresh: () => {
      calls.push("session")
    },
    sessionId: "session-1",
  })
  coordinator.registerSelectedDelegations({
    refresh: () => {
      calls.push("delegations")
    },
    sessionId: "session-1",
  })

  source.emit(frame("invalidate", 1, { resourceId: "message-1", resourceType: "message" }))
  await flush()
  expect(calls).toEqual([])

  source.emit(frame("invalidate", 2, { resourceId: "run-1", resourceType: "run" }))
  await flush()
  expect(calls).toEqual(["delegations"])
  coordinator.close()
})

test("keeps input-needed as one selected-session bounded refresh", async () => {
  let snapshotRefreshCount = 0
  const { coordinator, source } = coordinatorCreate()
  const snapshotRefresh = () => {
    snapshotRefreshCount += 1
  }
  coordinator.registerSelectedSession({ refresh: snapshotRefresh, sessionId: "session-1" })

  source.emit(frame("input-needed", 1))
  await flush()

  expect(snapshotRefreshCount).toBe(1)
  coordinator.close()
})

test("refreshes the registry status seam for run start and every terminal event", async () => {
  let refreshCount = 0
  const { coordinator, source } = coordinatorCreate()
  coordinator.registerRunLifecycle(() => {
    refreshCount += 1
  })

  source.emit(frame("run-started", 1))
  source.emit(frame("run-completed", 2))
  source.emit(frame("run-failed", 3))
  source.emit(frame("run-cancelled", 4))
  source.emit(frame("run-interrupted", 5))
  await flush()

  expect(refreshCount).toBe(5)
  coordinator.close()
})

test("refreshes the matching selected session, delegations, and lifecycle for every terminal kind", async () => {
  const terminalEventTypes = ["run-completed", "run-failed", "run-cancelled", "run-interrupted"] as const
  const calls: string[] = []
  const { coordinator, source } = coordinatorCreate()
  coordinator.registerSelectedSession({
    refresh: () => {
      calls.push("session")
    },
    sessionId: "session-1",
  })
  coordinator.registerSelectedDelegations({
    refresh: () => {
      calls.push("delegations")
    },
    sessionId: "session-1",
  })
  coordinator.registerRunLifecycle(() => {
    calls.push("lifecycle")
  })

  for (const [index, eventType] of terminalEventTypes.entries()) {
    source.emit(frame(eventType, index + 1))
    await flush()
    expect(calls).toEqual(["session", "delegations", "lifecycle"])
    calls.length = 0
  }

  coordinator.close()
})

test("does not refresh selected seams for a terminal event from another session", async () => {
  const calls: string[] = []
  const { coordinator, source } = coordinatorCreate()
  coordinator.registerSelectedSession({
    refresh: () => {
      calls.push("session")
    },
    sessionId: "session-2",
  })
  coordinator.registerSelectedDelegations({
    refresh: () => {
      calls.push("delegations")
    },
    sessionId: "session-2",
  })
  coordinator.registerSessionList(() => {
    calls.push("session-list")
  })
  coordinator.registerRunLifecycle(() => {
    calls.push("lifecycle")
  })

  source.emit(frame("run-failed", 1, { sessionId: "session-1" }))
  await flush()

  expect(calls).toEqual(["lifecycle"])
  coordinator.close()
})

test("deduplicates a terminal callback shared by selected session, delegations, and lifecycle", async () => {
  let refreshCount = 0
  const refresh = () => {
    refreshCount += 1
  }
  const { coordinator, source } = coordinatorCreate()
  coordinator.registerSelectedSession({ refresh, sessionId: "session-1" })
  coordinator.registerSelectedDelegations({ refresh, sessionId: "session-1" })
  coordinator.registerRunLifecycle(refresh)

  source.emit(frame("run-interrupted", 1))
  await flush()

  expect(refreshCount).toBe(1)
  coordinator.close()
})

test("refreshes the affected bounded session and session list when a run starts", async () => {
  const calls: string[] = []
  const { coordinator, source } = coordinatorCreate()
  coordinator.registerSessionList(() => {
    calls.push("session-list")
  })
  const sessionRefresh = () => {
    calls.push("session")
  }
  coordinator.registerSelectedSession({
    refresh: sessionRefresh,
    sessionId: "session-1",
  })
  coordinator.registerSelectedSession({
    refresh: () => {
      calls.push("other-session")
    },
    sessionId: "session-2",
  })

  source.emit(frame("run-started", 1))
  await flush()

  expect(calls).toEqual(["session-list", "session"])
  coordinator.close()
})

test("refreshes the registry status seam during reset reconciliation", async () => {
  let refreshCount = 0
  const { coordinator, source } = coordinatorCreate()
  coordinator.registerRunLifecycle(() => {
    refreshCount += 1
  })

  source.emit(frame("reset", 1))
  await flush()

  expect(refreshCount).toBe(1)
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
  coordinator.registerSelectedDelegations({
    sessionId: "session-1",
    refresh: () => {
      calls.push("delegations")
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

  expect(calls).toEqual(["session-list", "session", "delegations", "note-list", "note-detail"])
  expect(sources).toHaveLength(2)
  coordinator.close()
})

test("holds selected detail closed until one authoritative refresh completes for an expired global cursor", async () => {
  let releaseSelectedRefresh: (() => void) | undefined
  let selectedRefreshCount = 0
  const selectedRefresh = new Promise<void>((resolve) => {
    releaseSelectedRefresh = resolve
  })
  const { coordinator, source, sources } = coordinatorCreate()
  coordinator.registerSelectedSession({
    refresh: async () => {
      selectedRefreshCount += 1
      await selectedRefresh
    },
    sessionId: "session-1",
  })

  source.emit(frame("reset", 1))
  await flush()

  expect(selectedRefreshCount).toBe(1)
  expect(sources).toHaveLength(1)
  expect(coordinator.eventFeed.selectedDetailEnabled()).toBe(false)

  releaseSelectedRefresh?.()
  await flush()

  expect(sources).toHaveLength(2)
  expect(coordinator.eventFeed.selectedDetailEnabled()).toBe(true)
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

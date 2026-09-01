import { expect, mock, test } from "bun:test"
import * as solidRuntime from "solid-js/dist/solid.js"
import { createRoot, createSignal } from "solid-js/dist/solid.js"
import type { SessionBoundedSnapshot } from "../src/session/api/sessionBoundedSnapshotSchema.js"
import type { SessionDetailSseFrame } from "../src/session/api/sessionDetailSseFrameSchema.js"

mock.module("solid-js", () => solidRuntime)
const { sessionDetailStateCreate } = await import("../src/session/client/sessionDetailStateCreate.js")

type FakeListener = (event: Event) => void

class FakeEventSource {
  readonly listeners = new Map<string, Set<FakeListener>>()
  closeCount = 0
  onerror: ((event: Event) => void) | null = null
  onopen: ((event: Event) => void) | null = null

  addEventListener(type: string, listener: FakeListener): void {
    const current = this.listeners.get(type) ?? new Set<FakeListener>()
    current.add(listener)
    this.listeners.set(type, current)
  }

  close(): void {
    this.closeCount += 1
  }

  emit(frame: SessionDetailSseFrame): void {
    const event = new Event(frame.event) as Event & { data?: unknown; lastEventId?: unknown }
    event.data = JSON.stringify(frame.data)
    event.lastEventId = frame.id
    for (const listener of [...(this.listeners.get(frame.event) ?? [])]) listener(event)
  }

  open(): void {
    this.onopen?.(new Event("open"))
  }

  removeEventListener(type: string, listener: FakeListener): void {
    this.listeners.get(type)?.delete(listener)
  }
}

function snapshotCreate(sessionId: string, throughPosition: number): SessionBoundedSnapshot {
  return {
    detailCursor: `detail-${sessionId}-${throughPosition}`,
    hasMore: false,
    latestAnswer: null,
    olderCursor: null,
    semanticSteps: [],
    session: { id: sessionId, pinned: false, projectPath: "~", revision: 1, title: sessionId },
    state: { input: null, run: null },
    throughPosition,
  }
}

function entryFrame(input: {
  changePosition: number
  entryId?: string
  position?: number
  sessionId?: string
  summary?: string
  terminalKind?: "cancelled" | "completed" | "failed" | "interrupted"
}): SessionDetailSseFrame {
  const sessionId = input.sessionId ?? "session-1"
  const entryId = input.entryId ?? `entry-${input.changePosition}`
  const id = `cursor-${sessionId}-${input.changePosition}`
  return {
    data: {
      changePosition: input.changePosition,
      entryId,
      eventType: "entry",
      id,
      kind: "run",
      payload: {
        detailId: `run-${entryId}`,
        id: entryId,
        kind: "run",
        status: "running",
        summary: input.summary ?? entryId,
        ...(input.terminalKind === undefined ? {} : { terminalKind: input.terminalKind }),
      },
      position: input.position ?? input.changePosition,
      sessionId,
      sourceDetailId: "",
      sourceId: `run-${entryId}`,
      sourceType: "run",
    },
    event: "entry",
    id,
  }
}

function resetFrame(sessionId = "session-1", position = 20): SessionDetailSseFrame {
  const id = `reset-${sessionId}-${position}`
  return {
    data: {
      asOfPosition: position,
      eventType: "reset",
      id,
      reason: "cursor-expired",
      sessionId,
    },
    event: "reset",
    id,
  }
}

test("attaches from the snapshot cursor and applies ordered changes strictly after its watermark", () => {
  const sources: FakeEventSource[] = []
  const urls: string[] = []
  const root = createRoot((dispose) => ({
    dispose,
    state: sessionDetailStateCreate({
      eventSourceFactory: (url) => {
        urls.push(url)
        const source = new FakeEventSource()
        sources.push(source)
        return source
      },
      resnapshot: () => undefined,
      snapshot: () => snapshotCreate("session-1", 10),
    }),
  }))
  const source = sources[0]
  if (source === undefined) throw new Error("missing selected-session source")

  expect(urls).toEqual(["/api/sessions/session-1/events?after=detail-session-1-10"])
  source.emit(entryFrame({ changePosition: 10 }))
  source.emit(entryFrame({ changePosition: 12, entryId: "later", position: 20 }))
  source.emit(entryFrame({ changePosition: 11, entryId: "stale", position: 11 }))
  source.emit(entryFrame({ changePosition: 13, entryId: "earlier", position: 15 }))
  source.emit(entryFrame({ changePosition: 14, entryId: "later", position: 20, summary: "updated" }))
  source.emit(entryFrame({ changePosition: 14, entryId: "later", position: 20, summary: "duplicate" }))

  expect(root.state.entries().map((entry) => [entry.entryId, entry.changePosition])).toEqual([
    ["earlier", 13],
    ["later", 14],
  ])
  expect(root.state.entries()[1]?.payload).toMatchObject({ summary: "updated" })
  root.dispose()
})

test("ignores stale selection generations and keeps switched sessions isolated", () => {
  const [snapshot, snapshotSet] = createSignal<SessionBoundedSnapshot | undefined>(snapshotCreate("session-1", 5))
  const sources: FakeEventSource[] = []
  const root = createRoot((dispose) => ({
    dispose,
    state: sessionDetailStateCreate({
      eventSourceFactory: () => {
        const source = new FakeEventSource()
        sources.push(source)
        return source
      },
      resnapshot: () => undefined,
      snapshot,
    }),
  }))
  const previous = sources[0]
  const staleListener = [...(previous?.listeners.get("entry") ?? [])][0]
  if (previous === undefined || staleListener === undefined) throw new Error("missing first selection listener")

  snapshotSet(snapshotCreate("session-2", 8))
  expect(previous.closeCount).toBe(1)
  expect(root.state.entries()).toEqual([])
  const staleEvent = new Event("entry") as Event & { data?: unknown; lastEventId?: unknown }
  const staleFrame = entryFrame({ changePosition: 9, sessionId: "session-1" })
  staleEvent.data = JSON.stringify(staleFrame.data)
  staleEvent.lastEventId = staleFrame.id
  staleListener(staleEvent)
  expect(root.state.entries()).toEqual([])

  sources[1]?.emit(entryFrame({ changePosition: 9, sessionId: "session-2" }))
  expect(root.state.entries().map((entry) => entry.sessionId)).toEqual(["session-2"])
  root.dispose()
})

test("clears selected-stream entries and cursor state when the account scope is disabled", () => {
  const [enabled, enabledSet] = createSignal(true)
  const sources: FakeEventSource[] = []
  const root = createRoot((dispose) => ({
    dispose,
    state: sessionDetailStateCreate({
      enabled,
      eventSourceFactory: () => {
        const source = new FakeEventSource()
        sources.push(source)
        return source
      },
      resnapshot: () => undefined,
      snapshot: () => snapshotCreate("session-1", 5),
    }),
  }))

  sources[0]?.emit(entryFrame({ changePosition: 6 }))
  expect(root.state.entries()).toHaveLength(1)
  enabledSet(false)
  expect(sources[0]?.closeCount).toBe(1)
  expect(root.state.entries()).toEqual([])
  expect(root.state.url()).toBeUndefined()
  expect(root.state.status()).toBe("idle")

  enabledSet(true)
  expect(root.state.url()).toBe("/api/sessions/session-1/events?after=detail-session-1-5")
  expect(sources).toHaveLength(2)
  root.dispose()
})

test("retains selected detail during eviction until its authoritative replacement succeeds", () => {
  const reasons: string[] = []
  const sources: FakeEventSource[] = []
  const [snapshot, snapshotSet] = createSignal<SessionBoundedSnapshot | undefined>(snapshotCreate("session-1", 1))
  const root = createRoot((dispose) => ({
    dispose,
    state: sessionDetailStateCreate({
      eventSourceFactory: () => {
        const source = new FakeEventSource()
        sources.push(source)
        return source
      },
      maximumEntries: 1,
      resnapshot: (reason) => reasons.push(reason),
      snapshot,
    }),
  }))

  sources[0]?.emit(entryFrame({ changePosition: 2 }))
  sources[0]?.emit(entryFrame({ changePosition: 3 }))
  expect(reasons).toEqual(["eviction"])
  expect(root.state.entries().map((entry) => entry.changePosition)).toEqual([2])
  expect(root.state.status()).toBe("resnapshotting")

  snapshotSet(snapshotCreate("session-1", 3))
  sources[1]?.emit(resetFrame("session-1", 4))
  expect(reasons).toEqual(["eviction", "reset"])
  expect(root.state.entries()).toEqual([])
  root.dispose()
})

test("bounds retained bytes and reconnects from the last applied selected cursor", () => {
  const reasons: string[] = []
  const sources: FakeEventSource[] = []
  const urls: string[] = []
  const root = createRoot((dispose) => ({
    dispose,
    state: sessionDetailStateCreate({
      eventSourceFactory: (url) => {
        urls.push(url)
        const source = new FakeEventSource()
        sources.push(source)
        return source
      },
      maximumBytes: 500,
      resnapshot: (reason) => reasons.push(reason),
      snapshot: () => snapshotCreate("session-1", 1),
    }),
  }))

  sources[0]?.emit(entryFrame({ changePosition: 2, summary: "small" }))
  root.state.reconnect()
  expect(urls[1]).toBe("/api/sessions/session-1/events?after=cursor-session-1-2")
  expect(sources[0]?.closeCount).toBe(1)
  sources[1]?.emit(entryFrame({ changePosition: 3, summary: "x".repeat(500) }))
  expect(reasons).toEqual(["eviction"])
  expect(root.state.bytes()).toBeGreaterThan(0)
  root.dispose()
})

test("retains every exact terminal kind through delayed and rejected replacement", () => {
  const terminalKinds = ["completed", "failed", "cancelled", "interrupted"] as const
  for (const terminalKind of terminalKinds) {
    const reasons: string[] = []
    const sources: FakeEventSource[] = []
    const [snapshot, snapshotSet] = createSignal<SessionBoundedSnapshot | undefined>(snapshotCreate("session-1", 1))
    const root = createRoot((dispose) => ({
      dispose,
      state: sessionDetailStateCreate({
        eventSourceFactory: () => {
          const source = new FakeEventSource()
          sources.push(source)
          return source
        },
        resnapshot: (reason) => reasons.push(reason),
        snapshot,
      }),
    }))

    sources[0]?.emit(entryFrame({ changePosition: 5, entryId: `run-${terminalKind}`, terminalKind }))
    expect(reasons).toEqual(["terminal"])
    expect(root.state.entries()[0]?.payload).toMatchObject({ terminalKind })
    expect(root.state.status()).toBe("resnapshotting")

    snapshotSet(snapshotCreate("session-1", 4))
    expect(root.state.entries()[0]?.payload).toMatchObject({ terminalKind })
    expect(root.state.status()).toBe("resnapshotting")

    snapshotSet(snapshotCreate("session-1", 5))
    expect(root.state.entries()).toEqual([])
    expect(sources.length).toBe(2)
    root.dispose()
  }
})

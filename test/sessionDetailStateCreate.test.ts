import { expect, mock, test } from "bun:test"
import * as solidRuntime from "solid-js/dist/solid.js"
import { createRoot, createSignal } from "solid-js/dist/solid.js"
import type { SessionBoundedSnapshot } from "../src/session/api/sessionBoundedSnapshotSchema.js"
import type { SessionDetailSseFrame } from "../src/session/api/sessionDetailSseFrameSchema.js"
import type { StreamEventSourceError } from "../src/stream/client/streamEventSourceError.js"
import type { StreamEventSourceEvent } from "../src/stream/client/streamEventSourceEvent.js"

mock.module("solid-js", () => solidRuntime)
const { sessionDetailStateCreate } = await import("../src/session/client/sessionDetailStateCreate.js")

type FakeListener = (event: StreamEventSourceEvent) => void

class FakeEventSource {
  readonly listeners = new Map<string, Set<FakeListener>>()
  readonly url: string
  closeCount = 0
  onerror: ((error?: StreamEventSourceError) => void) | null = null
  onopen: (() => void) | null = null
  readyState = 0

  constructor(url = "") {
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

  emit(frame: SessionDetailSseFrame): void {
    const event = { data: JSON.stringify(frame.data), lastEventId: frame.id }
    for (const listener of [...(this.listeners.get(frame.event) ?? [])]) listener(event)
  }

  open(): void {
    this.readyState = 1
    this.onopen?.()
  }

  error(status?: number, readyState = 2): void {
    this.readyState = readyState
    this.onerror?.(status === undefined ? {} : { status })
  }

  removeEventListener(type: string, listener: FakeListener): void {
    this.listeners.get(type)?.delete(listener)
  }
}

function snapshotCreate(
  sessionId: string,
  throughPosition: number,
  semanticSteps: SessionBoundedSnapshot["semanticSteps"] = [],
): SessionBoundedSnapshot {
  return {
    detailCursor: `detail-${sessionId}-${throughPosition}`,
    hasMore: false,
    latestAnswer: null,
    olderCursor: null,
    semanticSteps,
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

function sourceEvent(frame: SessionDetailSseFrame): StreamEventSourceEvent {
  return { data: JSON.stringify(frame.data), lastEventId: frame.id }
}

test("attaches from the snapshot cursor and applies ordered changes strictly after its watermark", () => {
  const sources: FakeEventSource[] = []
  const urls: string[] = []
  const resnapshotReasons: string[] = []
  const root = createRoot((dispose) => ({
    dispose,
    state: sessionDetailStateCreate({
      eventSourceFactory: (url) => {
        urls.push(url)
        const source = new FakeEventSource()
        sources.push(source)
        return source
      },
      resnapshot: (reason) => resnapshotReasons.push(reason),
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
  expect(resnapshotReasons).toEqual([])
  root.dispose()
})

test("replaces the selected source once when its cursor expires", () => {
  const sources: FakeEventSource[] = []
  const [snapshot, snapshotSet] = createSignal<SessionBoundedSnapshot>(snapshotCreate("session-1", 10))
  const reasons: string[] = []
  const root = createRoot((dispose) => ({
    dispose,
    state: sessionDetailStateCreate({
      eventSourceFactory: (url) => {
        const source = new FakeEventSource(url)
        sources.push(source)
        return source
      },
      resnapshot: (reason) => {
        reasons.push(reason)
        snapshotSet(snapshotCreate("session-1", 20))
      },
      snapshot,
    }),
  }))

  const initial = sources[0]
  if (initial === undefined) throw new Error("missing initial selected source")
  initial.emit(resetFrame("session-1", 20))

  expect(reasons).toEqual(["reset"])
  expect(initial.closeCount).toBe(1)
  expect(sources).toHaveLength(2)
  expect(sources[1]?.url).toBe("/api/sessions/session-1/events?after=detail-session-1-20")
  root.dispose()
})

test("resnapshots from an authoritative cursor after a CLOSED cursor failure and reopens exactly once", () => {
  const reasons: string[] = []
  const sources: FakeEventSource[] = []
  const [snapshot, snapshotSet] = createSignal<SessionBoundedSnapshot>(snapshotCreate("session-1", 10))
  const root = createRoot((dispose) => ({
    dispose,
    state: sessionDetailStateCreate({
      eventSourceFactory: (url) => {
        const source = new FakeEventSource(url)
        sources.push(source)
        return source
      },
      resnapshot: (reason) => {
        reasons.push(reason)
        snapshotSet(snapshotCreate("session-1", 20))
      },
      snapshot,
    }),
  }))

  const initial = sources[0]
  if (initial === undefined) throw new Error("missing initial selected source")
  const staleError = initial.onerror
  initial.error(400)
  staleError?.({ status: 400 })

  expect(reasons).toEqual(["reset"])
  expect(initial.closeCount).toBe(1)
  expect(sources).toHaveLength(2)
  expect(sources[1]?.url).toBe("/api/sessions/session-1/events?after=detail-session-1-20")
  root.dispose()
})

test("closes the selected source and follows the authentication path for 401 and 403", () => {
  for (const status of [401, 403]) {
    const sources: FakeEventSource[] = []
    const reasons: string[] = []
    let authenticationErrors = 0
    const root = createRoot((dispose) => ({
      dispose,
      state: sessionDetailStateCreate({
        eventSourceFactory: (url) => {
          const source = new FakeEventSource(url)
          sources.push(source)
          return source
        },
        onAuthenticationError: () => {
          authenticationErrors += 1
        },
        resnapshot: (reason) => reasons.push(reason),
        snapshot: () => snapshotCreate("session-1", 10),
      }),
    }))

    const source = sources[0]
    if (source === undefined) throw new Error("missing selected source")
    source.error(status)

    expect(authenticationErrors).toBe(1)
    expect(reasons).toEqual([])
    expect(source.closeCount).toBe(1)
    expect(root.state.status()).toBe("idle")
    root.dispose()
  }
})

test("keeps transient reconnecting sources attached without creating duplicates", () => {
  const sources: FakeEventSource[] = []
  const root = createRoot((dispose) => ({
    dispose,
    state: sessionDetailStateCreate({
      eventSourceFactory: (url) => {
        const source = new FakeEventSource(url)
        sources.push(source)
        return source
      },
      resnapshot: () => undefined,
      snapshot: () => snapshotCreate("session-1", 10),
    }),
  }))

  sources[0]?.error(undefined, 0)
  expect(root.state.status()).toBe("reconnecting")
  expect(sources).toHaveLength(1)

  root.state.reconnect()
  expect(sources).toHaveLength(2)
  expect(sources[0]?.closeCount).toBe(1)
  root.dispose()
})

test("defers selected source recovery until the replacement snapshot is installed", () => {
  const sources: FakeEventSource[] = []
  const [enabled, enabledSet] = createSignal(true)
  const [snapshot, snapshotSet] = createSignal<SessionBoundedSnapshot>(snapshotCreate("session-1", 10))
  const root = createRoot((dispose) => ({
    dispose,
    state: sessionDetailStateCreate({
      enabled,
      eventSourceFactory: (url) => {
        const source = new FakeEventSource(url)
        sources.push(source)
        return source
      },
      resnapshot: () => undefined,
      snapshot,
    }),
  }))

  enabledSet(false)
  snapshotSet(snapshotCreate("session-1", 20))
  expect(sources).toHaveLength(1)
  expect(sources[0]?.closeCount).toBe(1)

  enabledSet(true)
  expect(sources).toHaveLength(2)
  expect(sources[1]?.url).toBe("/api/sessions/session-1/events?after=detail-session-1-20")
  root.dispose()
})

test("ignores late entry, terminal, and reset frames from a superseded selected session", () => {
  const [snapshot, snapshotSet] = createSignal<SessionBoundedSnapshot | undefined>(snapshotCreate("session-1", 5))
  const sources: FakeEventSource[] = []
  const reasons: string[] = []
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
  const previous = sources[0]
  const staleListener = [...(previous?.listeners.get("entry") ?? [])][0]
  const staleResetListener = [...(previous?.listeners.get("reset") ?? [])][0]
  const staleError = previous?.onerror
  if (previous === undefined || staleListener === undefined || staleResetListener === undefined || staleError === null)
    throw new Error("missing first selection listener")

  snapshotSet(snapshotCreate("session-2", 8))
  expect(previous.closeCount).toBe(1)
  expect(root.state.entries()).toEqual([])
  const staleFrame = entryFrame({ changePosition: 9, sessionId: "session-1" })
  const staleTerminalFrame = entryFrame({ changePosition: 10, sessionId: "session-1", terminalKind: "failed" })
  const staleResetFrame = resetFrame("session-1", 11)
  staleListener(sourceEvent(staleFrame))
  staleListener(sourceEvent(staleTerminalFrame))
  staleResetListener(sourceEvent(staleResetFrame))
  staleError?.({ status: 400 })
  expect(root.state.entries()).toEqual([])
  expect(reasons).toEqual([])
  expect(sources[1]?.closeCount).toBe(0)

  sources[1]?.emit(entryFrame({ changePosition: 9, sessionId: "session-2" }))
  expect(root.state.entries().map((entry) => entry.sessionId)).toEqual(["session-2"])
  root.dispose()
})

test("clears selected-stream entries and ignores late frames when account authorization is disabled", () => {
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
  const staleListener = [...(sources[0]?.listeners.get("entry") ?? [])][0]
  const staleResetListener = [...(sources[0]?.listeners.get("reset") ?? [])][0]
  if (staleListener === undefined || staleResetListener === undefined)
    throw new Error("missing account-scoped selection listener")

  sources[0]?.emit(entryFrame({ changePosition: 6 }))
  expect(root.state.entries()).toHaveLength(1)
  enabledSet(false)
  expect(sources[0]?.closeCount).toBe(1)
  expect(root.state.entries()).toEqual([])
  expect(root.state.url()).toBeUndefined()
  expect(root.state.status()).toBe("idle")
  const staleFrame = entryFrame({ changePosition: 7, terminalKind: "completed" })
  const staleResetFrame = resetFrame("session-1", 8)
  staleListener(sourceEvent(staleFrame))
  expect(root.state.entries()).toEqual([])
  staleResetListener(sourceEvent(staleResetFrame))
  expect(root.state.status()).toBe("idle")

  enabledSet(true)
  expect(root.state.url()).toBe("/api/sessions/session-1/events?after=detail-session-1-5")
  expect(sources).toHaveLength(2)
  staleListener(sourceEvent(staleFrame))
  staleResetListener(sourceEvent(staleResetFrame))
  expect(root.state.entries()).toEqual([])
  expect(root.state.status()).toBe("connecting")
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

  snapshotSet(snapshotCreate("session-1", 2))
  expect(root.state.status()).toBe("resnapshotting")
  expect(root.state.entries().map((entry) => entry.changePosition)).toEqual([2])

  snapshotSet(snapshotCreate("session-1", 3))
  expect(sources).toHaveLength(2)
  sources[1]?.emit(resetFrame("session-1", 4))
  expect(reasons).toEqual(["eviction", "reset"])
  expect(root.state.entries()).toEqual([])

  snapshotSet(snapshotCreate("session-1", 3))
  expect(root.state.status()).toBe("resnapshotting")
  snapshotSet(snapshotCreate("session-1", 4))
  expect(sources).toHaveLength(3)
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

  const retained = entryFrame({ changePosition: 2, position: 20, summary: "small" })
  sources[0]?.emit(retained)
  root.state.reconnect()
  expect(urls[1]).toBe("/api/sessions/session-1/events?after=cursor-session-1-2")
  expect(sources[0]?.closeCount).toBe(1)
  sources[1]?.emit(entryFrame({ changePosition: 3, summary: "x".repeat(500) }))
  expect(reasons).toEqual(["eviction"])
  expect(root.state.bytes()).toBe(new TextEncoder().encode(JSON.stringify(retained.data)).byteLength)
  expect(root.state.entries()).toMatchObject([{ changePosition: 2, payload: { summary: "small" }, position: 20 }])
  root.dispose()
})

test("replaces mutable entry bytes instead of accumulating old payload sizes", () => {
  const sources: FakeEventSource[] = []
  const root = createRoot((dispose) => ({
    dispose,
    state: sessionDetailStateCreate({
      eventSourceFactory: () => {
        const source = new FakeEventSource()
        sources.push(source)
        return source
      },
      maximumBytes: 10_000,
      resnapshot: () => undefined,
      snapshot: () => snapshotCreate("session-1", 1),
    }),
  }))
  const initial = entryFrame({ changePosition: 2, entryId: "mutable", summary: "initial" })
  const updated = entryFrame({ changePosition: 3, entryId: "mutable", summary: "updated" })

  sources[0]?.emit(initial)
  sources[0]?.emit(updated)

  expect(root.state.bytes()).toBe(new TextEncoder().encode(JSON.stringify(updated.data)).byteLength)
  expect(root.state.bytes()).not.toBe(
    new TextEncoder().encode(JSON.stringify(initial.data)).byteLength +
      new TextEncoder().encode(JSON.stringify(updated.data)).byteLength,
  )
  expect(root.state.entries()).toMatchObject([
    { changePosition: 3, entryId: "mutable", payload: { summary: "updated" } },
  ])
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

test("rejects stale terminal and nonterminal changes after a newer terminal snapshot state", () => {
  const reasons: string[] = []
  const sources: FakeEventSource[] = []
  const terminalStep = {
    detailId: "run-terminal",
    id: "terminal-entry",
    kind: "run" as const,
    sequence: 5,
    status: "succeeded" as const,
    summary: "Completed",
    terminalKind: "completed" as const,
  }
  const root = createRoot((dispose) => ({
    dispose,
    state: sessionDetailStateCreate({
      eventSourceFactory: () => {
        const source = new FakeEventSource()
        sources.push(source)
        return source
      },
      resnapshot: (reason) => reasons.push(reason),
      snapshot: () => snapshotCreate("session-1", 5, [terminalStep]),
    }),
  }))

  sources[0]?.emit(entryFrame({ changePosition: 6, entryId: "terminal-entry", summary: "stale nonterminal" }))
  sources[0]?.emit(
    entryFrame({ changePosition: 7, entryId: "terminal-entry", summary: "stale terminal", terminalKind: "failed" }),
  )

  expect(root.state.entries()).toEqual([])
  expect(reasons).toEqual([])
  root.dispose()
})

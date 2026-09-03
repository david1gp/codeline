import { createEffect, onCleanup, untrack } from "solid-js"
import type { StreamEventSourceError } from "../../stream/client/streamEventSourceError.js"
import type { StreamEventSourceEvent } from "../../stream/client/streamEventSourceEvent.js"
import { signalObjectCreate } from "../../ui/signalObjectCreate.js"
import type { SessionBoundedSnapshot } from "../api/sessionBoundedSnapshotSchema.js"
import type { SessionDetailEvent } from "../api/sessionDetailEventSchema.js"
import { sessionDetailEventParse } from "./sessionDetailEventParse.js"
import type { SessionDetailSource } from "./sessionDetailSource.js"
import type { SessionDetailSourceFactory } from "./sessionDetailSourceFactory.js"

type SessionDetailEntryEvent = Extract<SessionDetailEvent, { eventType: "entry" }>

type SessionDetailStateOptions = {
  enabled?: () => boolean
  eventSourceFactory: SessionDetailSourceFactory
  maximumBytes?: number
  maximumEntries?: number
  onAuthenticationError?: () => void
  resnapshot: (reason: "eviction" | "invalid-event" | "reset" | "terminal") => unknown
  snapshot: () => SessionBoundedSnapshot | undefined
}

const sessionDetailMaximumBytes = 4 * 1024 * 1024
const sessionDetailMaximumEntries = 512
const sessionDetailClosedReadyState = 2
const sessionDetailCursorFailureStatus = 400
const sessionDetailUnauthorizedStatuses = new Set([401, 403])

function sessionDetailEventBytes(event: SessionDetailEntryEvent): number {
  return new TextEncoder().encode(JSON.stringify(event)).byteLength
}

function sessionDetailEntriesOrder(
  entries: ReadonlyMap<string, SessionDetailEntryEvent>,
): readonly SessionDetailEntryEvent[] {
  return [...entries.values()].sort(
    (left, right) => left.position - right.position || left.entryId.localeCompare(right.entryId),
  )
}

function sessionDetailTerminalKind(event: SessionDetailEntryEvent): string | undefined {
  if (
    event.kind !== "run" ||
    event.payload === null ||
    typeof event.payload !== "object" ||
    Array.isArray(event.payload)
  )
    return undefined
  const terminalKind = (event.payload as Record<string, unknown>).terminalKind
  return ["cancelled", "completed", "failed", "interrupted"].includes(String(terminalKind))
    ? String(terminalKind)
    : undefined
}

export function sessionDetailStateCreate(options: SessionDetailStateOptions) {
  const maximumBytesCandidate = options.maximumBytes ?? sessionDetailMaximumBytes
  const maximumEntriesCandidate = options.maximumEntries ?? sessionDetailMaximumEntries
  const maximumBytes =
    Number.isSafeInteger(maximumBytesCandidate) && maximumBytesCandidate > 0
      ? maximumBytesCandidate
      : sessionDetailMaximumBytes
  const maximumEntries =
    Number.isSafeInteger(maximumEntriesCandidate) && maximumEntriesCandidate > 0
      ? maximumEntriesCandidate
      : sessionDetailMaximumEntries

  const revision = signalObjectCreate(0)
  const status = signalObjectCreate<"idle" | "connecting" | "open" | "reconnecting" | "resnapshotting">("idle")
  const entriesById = new Map<string, SessionDetailEntryEvent>()
  const entryBytesById = new Map<string, number>()
  const terminalChangePositionByEntryId = new Map<string, number>()
  let retainedBytes = 0
  let source: SessionDetailSource | undefined
  let listeners = new Map<string, (event: StreamEventSourceEvent) => void>()
  let generation = 0
  let currentCursor: string | undefined
  let currentSessionId: string | undefined
  let throughPosition = 0
  let lastChangePosition = 0
  let resnapshotRequested = false
  let replacementMinimumPosition = 0
  let installedSnapshot: SessionBoundedSnapshot | undefined

  const changed = (): void => {
    untrack(() => revision.set(revision.get() + 1))
  }
  const entriesClear = (): void => {
    entriesById.clear()
    entryBytesById.clear()
    terminalChangePositionByEntryId.clear()
    retainedBytes = 0
    changed()
  }
  const snapshotTerminalStatesInstall = (snapshot: SessionBoundedSnapshot | undefined): void => {
    if (snapshot === undefined) return
    for (const step of snapshot.semanticSteps) {
      if (step.kind === "run" && step.terminalKind !== undefined)
        terminalChangePositionByEntryId.set(step.id, snapshot.throughPosition)
    }
  }
  const sourceClose = (): void => {
    const active = source
    if (active === undefined) return
    source = undefined
    try {
      active.onopen = null
    } catch (_error) {
      // Continue detaching an injected source when its handler cannot be cleared.
    }
    try {
      active.onerror = null
    } catch (_error) {
      // Continue detaching an injected source when its handler cannot be cleared.
    }
    for (const [eventType, listener] of listeners) {
      try {
        active.removeEventListener(eventType, listener)
      } catch (_error) {
        // Continue closing an injected source when listener removal fails.
      }
    }
    listeners = new Map()
    try {
      active.close()
    } catch (_error) {
      // A source that is already closed needs no further transport action.
    }
  }
  const resnapshot = (
    reason: "eviction" | "invalid-event" | "reset" | "terminal",
    minimumPosition = lastChangePosition,
  ): void => {
    replacementMinimumPosition = Math.max(replacementMinimumPosition, minimumPosition)
    if (resnapshotRequested) return
    resnapshotRequested = true
    generation += 1
    sourceClose()
    status.set("resnapshotting")
    options.resnapshot(reason)
  }
  const entryApply = (event: SessionDetailEntryEvent): void => {
    if (event.changePosition <= throughPosition || event.changePosition <= lastChangePosition) return
    if (terminalChangePositionByEntryId.has(event.entryId)) return
    const previous = entriesById.get(event.entryId)
    if (previous !== undefined && event.changePosition <= previous.changePosition) return

    const eventBytes = sessionDetailEventBytes(event)
    const previousBytes = entryBytesById.get(event.entryId) ?? 0
    const nextBytes = retainedBytes - previousBytes + eventBytes
    const nextEntries = entriesById.size + (previous === undefined ? 1 : 0)
    if (nextEntries > maximumEntries || nextBytes > maximumBytes) {
      resnapshot("eviction", event.changePosition)
      return
    }

    entriesById.set(event.entryId, event)
    entryBytesById.set(event.entryId, eventBytes)
    retainedBytes = nextBytes
    lastChangePosition = event.changePosition
    currentCursor = event.id
    changed()
    if (sessionDetailTerminalKind(event) !== undefined) {
      terminalChangePositionByEntryId.set(event.entryId, event.changePosition)
      resnapshot("terminal", event.changePosition)
    }
  }
  const eventHandle = (
    activeGeneration: number,
    activeSource: SessionDetailSource,
    eventType: "entry" | "reset",
    input: StreamEventSourceEvent,
  ): void => {
    if (
      options.enabled?.() === false ||
      activeGeneration !== generation ||
      source !== activeSource ||
      resnapshotRequested
    )
      return
    const parsed = sessionDetailEventParse({ ...input, event: eventType, id: input.lastEventId })
    if (!parsed.success) {
      resnapshot("invalid-event")
      return
    }
    const event = parsed.data.data
    if (event.sessionId !== currentSessionId) return
    if (event.eventType === "reset") {
      resnapshot("reset", event.asOfPosition)
      return
    }
    entryApply(event)
  }
  const urlCreate = (): string | undefined => {
    if (currentSessionId === undefined || currentCursor === undefined) return undefined
    const query = new URLSearchParams({ after: currentCursor })
    return `/api/sessions/${encodeURIComponent(currentSessionId)}/events?${query.toString()}`
  }
  const sourceOpen = (): void => {
    const url = urlCreate()
    if (options.enabled?.() === false || url === undefined || resnapshotRequested || source !== undefined) return
    let created: SessionDetailSource
    try {
      created = options.eventSourceFactory(url, { withCredentials: true })
    } catch (_error) {
      status.set("reconnecting")
      return
    }
    source = created
    status.set("connecting")
    const activeGeneration = generation
    created.onopen = () => {
      if (activeGeneration !== generation || source !== created) return
      status.set("open")
    }
    created.onerror = (error: StreamEventSourceError = {}) => {
      if (activeGeneration !== generation || source !== created) return
      if (error.status !== undefined && sessionDetailUnauthorizedStatuses.has(error.status)) {
        sourceClose()
        status.set("idle")
        options.onAuthenticationError?.()
        return
      }
      if (error.status === sessionDetailCursorFailureStatus || created.readyState === sessionDetailClosedReadyState) {
        sourceClose()
        resnapshot("reset")
        return
      }
      status.set("reconnecting")
    }
    try {
      for (const eventType of ["entry", "reset"] as const) {
        const listener = (event: StreamEventSourceEvent) => eventHandle(activeGeneration, created, eventType, event)
        listeners.set(eventType, listener)
        created.addEventListener(eventType, listener)
      }
    } catch (_error) {
      sourceClose()
      status.set("reconnecting")
    }
  }

  createEffect(() => {
    const snapshot = options.enabled?.() === false ? undefined : options.snapshot()
    const snapshotChanged = snapshot !== installedSnapshot
    const selectionChanged = snapshot?.session.id !== currentSessionId
    if (!snapshotChanged && !selectionChanged) return
    installedSnapshot = snapshot

    if (
      resnapshotRequested &&
      !selectionChanged &&
      snapshot !== undefined &&
      snapshot.throughPosition < replacementMinimumPosition
    ) {
      status.set("resnapshotting")
      return
    }

    generation += 1
    sourceClose()
    entriesClear()
    resnapshotRequested = false
    replacementMinimumPosition = 0
    currentCursor = snapshot?.detailCursor
    currentSessionId = snapshot?.session.id
    throughPosition = snapshot?.throughPosition ?? 0
    lastChangePosition = throughPosition
    snapshotTerminalStatesInstall(snapshot)
    status.set(snapshot === undefined ? "idle" : "connecting")
    if (snapshot !== undefined) sourceOpen()
  })

  onCleanup(() => {
    generation += 1
    sourceClose()
  })

  const reconnect = (): void => {
    if (
      options.enabled?.() === false ||
      currentSessionId === undefined ||
      currentCursor === undefined ||
      resnapshotRequested
    )
      return
    generation += 1
    sourceClose()
    status.set("reconnecting")
    sourceOpen()
  }

  return {
    bytes: () => {
      revision.get()
      return retainedBytes
    },
    entries: () => {
      revision.get()
      return sessionDetailEntriesOrder(entriesById)
    },
    reconnect,
    status: status.get,
    url: urlCreate,
  }
}

import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { apiRevisionSchema } from "../../api/schema/apiRevisionSchema.js"
import { type RunActiveSummary, runActiveSummarySchema } from "../../run/api/runActiveSummarySchema.js"
import {
  type SessionSettledSnapshotResponse,
  sessionSettledSnapshotResponseSchema,
} from "../../session/api/sessionSettledSnapshotResponseSchema.js"
import type { StreamSseFrame } from "../../stream/api/streamSseFrameSchema.js"
import { eventFeedCursorSchema } from "../../stream/client/eventFeedCursorSchema.js"
import { eventFeedEventParse } from "../../stream/client/eventFeedEventParse.js"
import {
  type EventFeedApplyResult,
  type EventFeedReconciliationInstruction,
  type EventFeedResource,
  type EventFeedResourceRevision,
  type EventFeedStaleResource,
  eventFeedStateCreate,
} from "../../stream/client/eventFeedStateCreate.js"
import type { UiDataLayerStatus } from "../../ui/uiDataLayerStatusSchema.js"
import type { EventFeedOwnerRegistry } from "./eventFeedOwnerRegistryCreate.js"

const eventFeedEventTypes = [
  "delta",
  "invalidate",
  "reset",
  "run-cancelled",
  "run-completed",
  "run-failed",
  "run-interrupted",
  "run-started",
] as const
const eventFeedClosedReadyState = 2
const eventFeedPath = "/api/events"
const eventFeedResourceTypeSchema = v.picklist(["agent", "message", "note", "run", "server", "session", "session-list"])
const eventFeedResourceReplacementSchema = v.strictObject({
  resourceId: v.pipe(v.string(), v.minLength(1)),
  resourceType: eventFeedResourceTypeSchema,
  revision: apiRevisionSchema,
})
const eventFeedResetBootstrapSchema = v.strictObject({
  activeRuns: v.array(runActiveSummarySchema),
  asOfCursor: eventFeedCursorSchema,
  lastEventId: v.optional(v.nullable(eventFeedCursorSchema)),
  resetCheckpoint: eventFeedCursorSchema,
  resourceRevisions: v.array(eventFeedResourceReplacementSchema),
})

type EventFeedTransportState = "closed" | "connecting" | "open" | "reconnecting"
type EventFeedReset = Extract<EventFeedReconciliationInstruction, { kind: "reset" }>
type EventFeedRunCheckpoint = Extract<EventFeedReconciliationInstruction, { kind: "run-checkpoint" }>
type EventFeedCompletion = Extract<EventFeedReconciliationInstruction, { kind: "authoritative-replacement" }>
type EventFeedMessage = Event & {
  data: unknown
  lastEventId: unknown
}
type EventFeedSource = {
  readonly readyState?: number
  addEventListener: (type: string, listener: EventListener) => void
  close: () => void
  onerror: ((event: Event) => void) | null
  onopen: ((event: Event) => void) | null
  removeEventListener: (type: string, listener: EventListener) => void
}
type EventFeedSourceFactory = (url: string, options: { withCredentials: boolean }) => EventFeedSource
export type EventFeedBootstrap =
  | {
      asOfCursor: string
      lastEventId?: string | null
    }
  | {
      asOfCursor?: null
      fresh: true
      lastEventId?: null
    }
type EventFeedCallbackResult<T> = Result<T> | Promise<Result<T>>
export type EventFeedResetBootstrap = v.InferOutput<typeof eventFeedResetBootstrapSchema>
type EventFeedResetCallbackInput = EventFeedReset
type EventFeedResetActiveRunInput = {
  lastSequence: number
  reason: "reset"
  runId: string
  sessionId: string
}
type EventFeedActiveRunCallbackInput = EventFeedRunCheckpoint | EventFeedResetActiveRunInput
type EventFeedSessionSnapshotInput = EventFeedCompletion
type EventFeedResetSessionSnapshotInput = {
  authoritative: "session-snapshot"
  kind: "authoritative-replacement"
  messageId: null
  preserveDeltas: false
  reason: "run-completed"
  resetDiscovered: true
  runId: string
  sessionId: string
  sessionRevision?: number
}
export type EventFeedReconciliationCallbacks = {
  activeRunSnapshotLoad: (input: EventFeedActiveRunCallbackInput) => EventFeedCallbackResult<RunActiveSummary>
  resourceRevalidate: (input: EventFeedStaleResource) => EventFeedCallbackResult<EventFeedResourceRevision | null>
  sessionSnapshotLoad: (
    input: EventFeedSessionSnapshotInput | EventFeedResetSessionSnapshotInput,
  ) => EventFeedCallbackResult<SessionSettledSnapshotResponse>
  sessionSnapshotReplace: (snapshot: SessionSettledSnapshotResponse) => EventFeedCallbackResult<void>
  shellListBootstrap: (input: EventFeedResetCallbackInput) => EventFeedCallbackResult<EventFeedResetBootstrap>
  visibleResources: () => readonly EventFeedResource[] | Promise<readonly EventFeedResource[]>
}
export type EventFeedCreateOptions = {
  bootstrap: EventFeedBootstrap
  eventSourceFactory: EventFeedSourceFactory
  initial?: {
    resourceRevisions?: readonly EventFeedResourceRevision[]
    settledCacheKeys?: readonly string[]
  }
  onError?: (result: Result<unknown>) => void
  onEvent?: (frame: StreamSseFrame) => void
  onAuthenticationError?: () => void
  onStateChange?: (state: UiDataLayerStatus) => void
  ownershipRegistry: EventFeedOwnerRegistry
  reconciliation: EventFeedReconciliationCallbacks
}

function eventFeedCursorValidate(cursor: unknown): Result<string> {
  const op = "eventFeedCreate"
  const parsed = v.safeParse(eventFeedCursorSchema, cursor)
  if (!parsed.success) return createResultError(op, "The event feed cursor is invalid.")
  return createResult(parsed.output)
}

function eventFeedUrlCreate(cursor: string | null): string {
  if (cursor === null) return eventFeedPath
  const query = new URLSearchParams({ after: cursor })
  return `${eventFeedPath}?${query.toString()}`
}

function eventFeedInstructionKey(instruction: EventFeedReconciliationInstruction): string {
  if (instruction.kind === "reset") return "reset"
  if (instruction.kind === "resource-stale") return `resource:${instruction.resourceType}:${instruction.resourceId}`
  if (instruction.kind === "run-checkpoint") return `run:${instruction.runId}`
  return `session:${instruction.runId}`
}

function eventFeedCallbackError<T>(operation: string): Result<T> {
  return createResultError(operation, "The event feed reconciliation callback failed.")
}

async function eventFeedCallbackRun<T>(
  operation: string,
  callback: () => EventFeedCallbackResult<T>,
): Promise<Result<T>> {
  try {
    return await callback()
  } catch (_error) {
    return eventFeedCallbackError(operation)
  }
}

function eventFeedBootstrapCursorResolve(bootstrap: EventFeedBootstrap): Result<string | null> {
  if ("fresh" in bootstrap) return createResult(null)
  return eventFeedCursorValidate(bootstrap.asOfCursor)
}

export function eventFeedCreate(options: EventFeedCreateOptions) {
  const cursor = eventFeedBootstrapCursorResolve(options.bootstrap)
  if (!cursor.success) throw new Error(cursor.errorMessage)
  const ownership = options.ownershipRegistry.acquire()
  if (!ownership.success) throw new Error(ownership.errorMessage)
  const ownerLease = ownership.data

  const initialLastEventId = options.bootstrap.lastEventId ?? (cursor.data === null ? null : cursor.data)
  const feedState = eventFeedStateCreate({
    initial: {
      asOfCursor: cursor.data,
      lastEventId: initialLastEventId,
      resourceRevisions: options.initial?.resourceRevisions,
      settledCacheKeys: options.initial?.settledCacheKeys,
    },
  })
  let currentCursor = cursor.data
  // False only until a bootstrap, reset, or reload attach supplies a cursor the
  // client chose. A cursorless fresh feed advancing through backlog does not
  // count, so a later run snapshot may still redirect the connection.
  let cursorAuthoritative = cursor.data !== null
  let browserOffline = false
  let transportState: EventFeedTransportState = "connecting"
  let closed = false
  let reconciliationEpoch = 0
  let reconnectAttempt = 0
  let source: EventFeedSource | null = null
  let sourceListeners = new Map<string, EventListener>()
  let resetProcessing = false
  let reportedStateKey: string | null = null
  const pending = new Map<string, EventFeedReconciliationInstruction>()
  const processing = new Map<string, Promise<Result<void>>>()
  let retryQueue: Promise<Result<void>> = Promise.resolve(createResult(undefined))

  const statusResolve = (): UiDataLayerStatus => {
    const dataState = feedState.state()
    if (closed || transportState === "closed") return { accountId: null, status: "offline" }
    if (resetProcessing || dataState.status.status === "reconciling") return dataState.status
    if (dataState.status.status === "stale") return dataState.status
    if (transportState !== "open") {
      return {
        attempt: Math.max(reconnectAttempt, 1),
        lastEventId: dataState.lastEventId,
        status: "reconnecting",
      }
    }
    return dataState.status
  }

  const stateEmit = (): void => {
    const nextStatus = statusResolve()
    const nextStatusKey = JSON.stringify(nextStatus)
    if (reportedStateKey === nextStatusKey) return
    reportedStateKey = nextStatusKey
    options.onStateChange?.(nextStatus)
  }

  const errorReport = (result: Result<unknown>): void => {
    options.onError?.(result)
  }

  const dataStateResolve = () => {
    const dataState = feedState.state()
    return { ...dataState, status: statusResolve() }
  }

  const sourceDetach = (closeSource: boolean): void => {
    const current = source
    if (current === null) return
    source = null
    current.onopen = null
    current.onerror = null
    for (const [eventType, listener] of sourceListeners) current.removeEventListener(eventType, listener)
    sourceListeners = new Map()
    if (closeSource) current.close()
  }

  const transportClose = (): void => {
    sourceDetach(true)
  }

  const offline = (): void => {
    if (closed) return
    browserOffline = true
    transportClose()
    transportStateSet("closed")
  }

  const transportStateSet = (nextState: EventFeedTransportState): void => {
    if (transportState === nextState) {
      stateEmit()
      return
    }
    transportState = nextState
    stateEmit()
  }

  const callbackResourceApply = (
    instruction: Extract<EventFeedReconciliationInstruction, { kind: "resource-stale" }>,
    replacement: EventFeedResourceRevision | null,
  ): Result<void> => {
    const next = callbackResourceResolve(instruction, replacement)
    if (!next.success) return next
    const replaced = feedState.resourceReplace(next.data)
    if (!replaced.success) return replaced
    return createResult(undefined)
  }

  const callbackResourceResolve = (
    instruction: Extract<EventFeedReconciliationInstruction, { kind: "resource-stale" }>,
    replacement: EventFeedResourceRevision | null,
  ): Result<EventFeedResourceRevision> => {
    const next = replacement ?? {
      resourceId: instruction.resourceId,
      resourceType: instruction.resourceType,
      revision: instruction.serverRevision,
    }
    if (next.resourceId !== instruction.resourceId || next.resourceType !== instruction.resourceType)
      return createResultError("eventFeedCreate", "The resource reconciliation returned another resource.")
    return createResult(next)
  }

  const callbackSessionValidate = (
    instruction: EventFeedSessionSnapshotInput | EventFeedResetSessionSnapshotInput,
    replacement: unknown,
  ): Result<SessionSettledSnapshotResponse> => {
    const parsed = v.safeParse(sessionSettledSnapshotResponseSchema, replacement)
    if (!parsed.success)
      return createResultError("eventFeedSessionSnapshotLoad", "The session snapshot does not match its contract.")
    if (parsed.output.session.id !== instruction.sessionId)
      return createResultError("eventFeedSessionSnapshotLoad", "The session snapshot belongs to another session.")
    if (parsed.output.session.revision !== parsed.output.revision)
      return createResultError("eventFeedSessionSnapshotLoad", "The session snapshot revision is inconsistent.")
    return createResult(parsed.output)
  }

  const callbackSessionApply = async (
    instruction: EventFeedSessionSnapshotInput | EventFeedResetSessionSnapshotInput,
    replacement: unknown,
  ): Promise<Result<void>> => {
    const snapshot = callbackSessionValidate(instruction, replacement)
    if (!snapshot.success) return snapshot
    const stored = await eventFeedCallbackRun("eventFeedSessionSnapshotReplace", () =>
      options.reconciliation.sessionSnapshotReplace(snapshot.data),
    )
    if (!stored.success) return stored
    const replaced = feedState.sessionReplace(snapshot.data)
    if (!replaced.success) return replaced
    return createResult(undefined)
  }

  const callbackRunApply = (snapshot: RunActiveSummary): Result<void> => {
    const replaced = feedState.runReplace(snapshot)
    if (!replaced.success) return replaced
    return createResult(undefined)
  }

  const epochCurrent = (epoch: number): boolean => !closed && epoch === reconciliationEpoch

  const reconcileReset = async (instruction: EventFeedReset, epoch: number): Promise<Result<void>> => {
    const bootstrap = await eventFeedCallbackRun("eventFeedResetBootstrap", () =>
      options.reconciliation.shellListBootstrap(instruction),
    )
    if (!bootstrap.success) return bootstrap
    const parsedBootstrap = v.safeParse(eventFeedResetBootstrapSchema, bootstrap.data)
    if (!parsedBootstrap.success)
      return createResultError("eventFeedResetBootstrap", "The reset bootstrap does not match its contract.")
    if (parsedBootstrap.output.resetCheckpoint !== instruction.resetCheckpoint)
      return createResultError(
        "eventFeedResetBootstrap",
        "The reset bootstrap is not bound to the requested reset checkpoint.",
      )
    if (!epochCurrent(epoch)) return createResult(undefined)

    const stagedResourceRevisions = new Map<string, EventFeedResourceRevision>()
    for (const revision of parsedBootstrap.output.resourceRevisions)
      stagedResourceRevisions.set(`${revision.resourceType}:${revision.resourceId}`, revision)

    const visibleResources = await eventFeedCallbackRun("eventFeedVisibleResources", async () =>
      createResult(await options.reconciliation.visibleResources()),
    )
    if (!visibleResources.success) return visibleResources
    if (!epochCurrent(epoch)) return createResult(undefined)

    for (const resource of visibleResources.data) {
      const cachedRevision =
        stagedResourceRevisions.get(`${resource.resourceType}:${resource.resourceId}`)?.revision ?? null
      const resourceResult = await eventFeedCallbackRun("eventFeedResourceRevalidate", () =>
        options.reconciliation.resourceRevalidate({
          ...resource,
          cachedRevision,
          serverRevision: cachedRevision ?? 0,
        }),
      )
      if (!resourceResult.success) return resourceResult
      if (!epochCurrent(epoch)) return createResult(undefined)
      const replacement = callbackResourceResolve(
        {
          cachedRevision,
          kind: "resource-stale",
          reason: "resource-stale",
          resourceId: resource.resourceId,
          resourceType: resource.resourceType,
          serverRevision: resourceResult.data?.revision ?? cachedRevision ?? 0,
        },
        resourceResult.data,
      )
      if (!replacement.success) return replacement
      stagedResourceRevisions.set(`${replacement.data.resourceType}:${replacement.data.resourceId}`, replacement.data)
    }

    const activeRuns: RunActiveSummary[] = []
    const completedSessions: Array<{
      instruction: EventFeedResetSessionSnapshotInput
      replacement: SessionSettledSnapshotResponse
    }> = []
    for (const activeRun of parsedBootstrap.output.activeRuns) {
      const runResult = await eventFeedCallbackRun("eventFeedActiveRunSnapshotLoad", () =>
        options.reconciliation.activeRunSnapshotLoad({
          lastSequence: activeRun.lastSequence,
          reason: "reset",
          runId: activeRun.runId,
          sessionId: activeRun.sessionId,
        }),
      )
      if (!runResult.success) return runResult
      if (!epochCurrent(epoch)) return createResult(undefined)
      const parsedRun = v.safeParse(runActiveSummarySchema, runResult.data)
      if (!parsedRun.success)
        return createResultError(
          "eventFeedActiveRunSnapshotLoad",
          "The active run snapshot does not match its contract.",
        )
      if (parsedRun.output.status !== "succeeded") {
        activeRuns.push(parsedRun.output)
        continue
      }

      const sessionInstruction: EventFeedResetSessionSnapshotInput = {
        authoritative: "session-snapshot",
        kind: "authoritative-replacement",
        messageId: null,
        preserveDeltas: false,
        reason: "run-completed",
        resetDiscovered: true,
        runId: activeRun.runId,
        sessionId: activeRun.sessionId,
      }
      const sessionResult = await eventFeedCallbackRun("eventFeedSessionSnapshotLoad", () =>
        options.reconciliation.sessionSnapshotLoad(sessionInstruction),
      )
      if (!sessionResult.success) return sessionResult
      if (!epochCurrent(epoch)) return createResult(undefined)
      const snapshot = callbackSessionValidate(sessionInstruction, sessionResult.data)
      if (!snapshot.success) return snapshot
      completedSessions.push({ instruction: sessionInstruction, replacement: snapshot.data })
      stagedResourceRevisions.set(`session:${snapshot.data.session.id}`, {
        resourceId: snapshot.data.session.id,
        resourceType: "session",
        revision: snapshot.data.revision,
      })
    }

    if (!epochCurrent(epoch)) return createResult(undefined)

    const resetCandidate = {
      activeRuns,
      asOfCursor: parsedBootstrap.output.asOfCursor,
      lastEventId: parsedBootstrap.output.lastEventId ?? parsedBootstrap.output.asOfCursor,
      resourceRevisions: [...stagedResourceRevisions.values()],
      resetCheckpoint: parsedBootstrap.output.resetCheckpoint,
      sessionSnapshots: completedSessions.map((completedSession) => completedSession.replacement),
    }
    const candidateValidated = feedState.resetValidate(resetCandidate)
    if (!candidateValidated.success) return candidateValidated

    for (const completedSession of completedSessions) {
      const sessionReplaced = await eventFeedCallbackRun("eventFeedSessionSnapshotReplace", () =>
        options.reconciliation.sessionSnapshotReplace(completedSession.replacement),
      )
      if (!sessionReplaced.success) return sessionReplaced
      if (!epochCurrent(epoch)) return createResult(undefined)
    }

    const completed = feedState.resetCommit(resetCandidate)
    if (!completed.success) return completed
    currentCursor = resetCandidate.asOfCursor
    cursorAuthoritative = true
    return createResult(undefined)
  }

  const reconcileOne = async (
    key: string,
    instruction: EventFeedReconciliationInstruction,
    epoch: number,
  ): Promise<Result<void>> => {
    if (!epochCurrent(epoch)) return createResult(undefined)
    if (instruction.kind === "reset") {
      resetProcessing = true
      const result = await reconcileReset(instruction, epoch)
      resetProcessing = false
      if (!result.success) {
        stateEmit()
        return result
      }
      if (!epochCurrent(epoch)) {
        stateEmit()
        return createResult(undefined)
      }
      pending.delete(key)
      openTransport()
      stateEmit()
      return createResult(undefined)
    }

    if (!epochCurrent(epoch)) return createResult(undefined)
    if (instruction.kind === "resource-stale") {
      const result = await eventFeedCallbackRun("eventFeedResourceRevalidate", () =>
        options.reconciliation.resourceRevalidate(instruction),
      )
      if (!result.success) {
        stateEmit()
        return result
      }
      if (!epochCurrent(epoch)) return createResult(undefined)
      const replaced = callbackResourceApply(instruction, result.data)
      if (!replaced.success) {
        stateEmit()
        return replaced
      }
      if (feedState.state().staleResources.has(key)) {
        stateEmit()
        return createResult(undefined)
      }
      if (pending.get(key) === instruction) pending.delete(key)
      stateEmit()
      return createResult(undefined)
    }

    if (instruction.kind === "authoritative-replacement") {
      const result = await eventFeedCallbackRun("eventFeedSessionSnapshotLoad", () =>
        options.reconciliation.sessionSnapshotLoad(instruction),
      )
      if (!result.success) {
        stateEmit()
        return result
      }
      if (!epochCurrent(epoch)) return createResult(undefined)
      const replaced = await callbackSessionApply(instruction, result.data)
      if (!replaced.success) {
        stateEmit()
        return replaced
      }
      if (pending.get(key) === instruction) pending.delete(key)
      stateEmit()
      return createResult(undefined)
    }

    const result = await eventFeedCallbackRun("eventFeedActiveRunSnapshotLoad", () =>
      options.reconciliation.activeRunSnapshotLoad(instruction),
    )
    if (!result.success) {
      stateEmit()
      return result
    }
    if (!epochCurrent(epoch)) return createResult(undefined)
    const replaced = callbackRunApply(result.data)
    if (!replaced.success) {
      stateEmit()
      return replaced
    }
    if (result.data.status === "succeeded") {
      const completionResult = await eventFeedCallbackRun("eventFeedSessionSnapshotLoad", () =>
        options.reconciliation.sessionSnapshotLoad({
          authoritative: "session-snapshot",
          kind: "authoritative-replacement",
          messageId: null,
          preserveDeltas: false,
          reason: "run-completed",
          runId: instruction.runId,
          sessionId: instruction.sessionId,
          sessionRevision: instruction.sessionRevision,
        }),
      )
      if (!completionResult.success) {
        stateEmit()
        return completionResult
      }
      if (!epochCurrent(epoch)) return createResult(undefined)
      const sessionReplaced = await callbackSessionApply(
        {
          authoritative: "session-snapshot",
          kind: "authoritative-replacement",
          messageId: null,
          preserveDeltas: false,
          reason: "run-completed",
          runId: instruction.runId,
          sessionId: instruction.sessionId,
          sessionRevision: instruction.sessionRevision,
        },
        completionResult.data,
      )
      if (!sessionReplaced.success) {
        stateEmit()
        return sessionReplaced
      }
    }
    if (pending.get(key) === instruction) pending.delete(key)
    stateEmit()
    return createResult(undefined)
  }

  const reconcileSchedule = (key: string): void => {
    if (closed || processing.has(key)) return
    const instruction = pending.get(key)
    if (instruction === undefined) return
    const epoch = reconciliationEpoch
    const promise = reconcileOne(key, instruction, epoch)
    processing.set(key, promise)
    void promise.then((result) => {
      processing.delete(key)
      if (!result.success) errorReport(result)
      const current = pending.get(key)
      if (!closed && current !== undefined && current !== instruction && !processing.has(key)) reconcileSchedule(key)
    })
  }

  const pendingAdd = (instruction: EventFeedReconciliationInstruction): void => {
    if (instruction.kind === "reset") {
      reconciliationEpoch += 1
      for (const key of pending.keys()) pending.delete(key)
    }
    const key = eventFeedInstructionKey(instruction)
    pending.set(key, instruction)
    stateEmit()
    reconcileSchedule(key)
  }

  const eventApply = (frame: StreamSseFrame): Result<EventFeedApplyResult> => {
    const applied = feedState.apply(frame.data)
    if (!applied.success) return applied
    if (frame.data.eventType !== "reset" && applied.data.applied) currentCursor = frame.id
    if (applied.data.instruction !== null) pendingAdd(applied.data.instruction)
    stateEmit()
    return applied
  }

  const sourceEventHandle = (candidate: EventFeedSource, eventType: string, input: Event): void => {
    if (closed || source !== candidate || resetProcessing) return
    const message = input as EventFeedMessage
    const parsed = eventFeedEventParse({ data: message.data, event: eventType, id: message.lastEventId })
    if (!parsed.success) {
      errorReport(parsed)
      close()
      return
    }
    if (parsed.data.data.eventType === "reset") transportClose()
    const applied = eventApply(parsed.data)
    if (!applied.success) {
      errorReport(applied)
      close()
      return
    }
    options.onEvent?.(parsed.data)
  }

  const openTransport = (): void => {
    if (browserOffline || closed || resetProcessing || source !== null) return
    transportStateSet("connecting")
    let created: EventFeedSource
    try {
      created = options.eventSourceFactory(eventFeedUrlCreate(currentCursor), { withCredentials: true })
    } catch (_error) {
      const result = createResultError("eventFeedCreate", "The event source could not be created.")
      errorReport(result)
      transportStateSet("closed")
      return
    }
    source = created
    const listeners = new Map<string, EventListener>()
    sourceListeners = listeners
    created.onopen = () => {
      if (closed || source !== created) return
      reconnectAttempt = 0
      transportStateSet("open")
    }
    created.onerror = () => {
      if (closed || source !== created || resetProcessing) return
      if (created.readyState === eventFeedClosedReadyState) {
        sourceDetach(false)
        transportStateSet("closed")
        options.onAuthenticationError?.()
        return
      }
      reconnectAttempt += 1
      transportStateSet("reconnecting")
    }
    for (const eventType of eventFeedEventTypes) {
      const listener: EventListener = (event) => sourceEventHandle(created, eventType, event)
      listeners.set(eventType, listener)
      created.addEventListener(eventType, listener)
    }
  }

  const online = (): void => {
    if (closed) return
    browserOffline = false
    openTransport()
  }

  const reconnect = (): void => {
    if (closed) return
    browserOffline = false
    transportClose()
    transportStateSet("reconnecting")
  }

  /**
   * Reload attach point. The caller has already read the run-specific active
   * snapshot from one consistent server snapshot; this folds it into feed state
   * and reopens `/api/events` after that run's cursor so only strictly newer
   * fragments arrive.
   *
   * A fresh reload has no bootstrap cursor, so the feed opens cursorless and may
   * consume backlog before the snapshot resolves. Those events are exactly the
   * ones the snapshot supersedes, so the attach must not be skipped merely
   * because the cursorless feed already advanced its cursor. Once a bootstrap,
   * reset, or earlier attach has established an authoritative cursor, that cursor
   * wins and the connection is left alone.
   */
  const activeRunAttach = (input: {
    lastCursor: string | null
    lastSequence: number
    partialText: string
    runId: string
    sessionId: string
    status: string
  }): Result<void> => {
    if (closed) return createResultError("eventFeedActiveRunAttach", "The event feed is closed.")
    const replaced = feedState.runReplace({
      lastSequence: input.lastSequence,
      partialText: input.partialText,
      runId: input.runId,
      sessionId: input.sessionId,
      status: input.status,
    })
    if (!replaced.success) return replaced

    if (input.lastCursor !== null && cursorAuthoritative === false) {
      const cursor = eventFeedCursorValidate(input.lastCursor)
      if (!cursor.success) return cursor
      cursorAuthoritative = true
      currentCursor = cursor.data
      transportClose()
      openTransport()
    }
    stateEmit()
    return createResult(undefined)
  }

  const close = (): void => {
    if (closed) return
    closed = true
    reconciliationEpoch += 1
    sourceDetach(true)
    ownerLease.release()
    stateEmit()
  }

  const reconcileWait = async (
    key: string,
    _instruction: EventFeedReconciliationInstruction,
  ): Promise<Result<void>> => {
    if (!epochCurrent(reconciliationEpoch)) return createResult(undefined)
    let active = processing.get(key)
    if (active === undefined) {
      reconcileSchedule(key)
      active = processing.get(key)
    }
    if (active === undefined) return createResult(undefined)
    return active
  }

  const retryReconciliationRun = async (): Promise<Result<void>> => {
    if (closed) return createResultError("eventFeedCreate", "The event feed is closed.")
    const keys = [...pending.keys()]
    for (const key of keys) {
      const current = pending.get(key)
      if (current === undefined) continue
      const result = await reconcileWait(key, current)
      if (!result.success) {
        errorReport(result)
        return result
      }
      const stillPending = pending.get(key)
      if (stillPending !== undefined && stillPending === current) pending.delete(key)
    }
    stateEmit()
    return createResult(undefined)
  }

  const retryReconciliation = (): Promise<Result<void>> => {
    const retry = retryQueue.then(retryReconciliationRun, retryReconciliationRun)
    retryQueue = retry.then(
      () => createResult(undefined),
      () => createResult(undefined),
    )
    return retry
  }

  stateEmit()
  openTransport()

  return {
    activeRunAttach,
    cleanup: close,
    close,
    get dataState() {
      return dataStateResolve()
    },
    getState: () => statusResolve(),
    getUrl: () => eventFeedUrlCreate(currentCursor),
    offline,
    online,
    reconnect,
    retryReconciliation,
    get state() {
      return statusResolve()
    },
  }
}

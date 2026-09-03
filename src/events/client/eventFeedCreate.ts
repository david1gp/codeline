import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { apiRevisionSchema } from "../../api/schema/apiRevisionSchema.js"
import type { GlobalSummarySseFrame } from "../../stream/api/globalSummarySseFrameSchema.js"
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
import type { StreamEventSourceError } from "../../stream/client/streamEventSourceError.js"
import type { StreamEventSourceEvent } from "../../stream/client/streamEventSourceEvent.js"
import type { UiDataLayerStatus } from "../../ui/uiDataLayerStatusSchema.js"
import type { EventFeedOwnerRegistry } from "./eventFeedOwnerRegistryCreate.js"
import type { EventFeedSource } from "./eventFeedSource.js"
import type { EventFeedSourceFactory } from "./eventFeedSourceFactory.js"

const eventFeedEventTypes = [
  "input-needed",
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
const eventFeedAuthenticationPath = "/api/auth/session"
const eventFeedCursorFailureStatus = 400
const eventFeedUnauthorizedStatuses = new Set([401, 403])
const eventFeedResourceTypeSchema = v.picklist(["agent", "message", "note", "run", "server", "session", "session-list"])
const eventFeedResourceReplacementSchema = v.strictObject({
  resourceId: v.pipe(v.string(), v.minLength(1)),
  resourceType: eventFeedResourceTypeSchema,
  revision: apiRevisionSchema,
})
const eventFeedResetBootstrapSchema = v.strictObject({
  asOfCursor: eventFeedCursorSchema,
  lastEventId: v.optional(v.nullable(eventFeedCursorSchema)),
  resetCheckpoint: eventFeedCursorSchema,
  resourceRevisions: v.array(eventFeedResourceReplacementSchema),
})

type EventFeedTransportState = "closed" | "connecting" | "open" | "reconnecting"
type EventFeedReset = Extract<EventFeedReconciliationInstruction, { kind: "reset" }>
type EventFeedFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
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
export type EventFeedReconciliationCallbacks = {
  resourceRevalidate: (input: EventFeedStaleResource) => EventFeedCallbackResult<EventFeedResourceRevision | null>
  shellListBootstrap: (input: EventFeedResetCallbackInput) => EventFeedCallbackResult<EventFeedResetBootstrap>
  visibleResources: () => readonly EventFeedResource[] | Promise<readonly EventFeedResource[]>
}
export type EventFeedCreateOptions = {
  bootstrap: EventFeedBootstrap
  eventSourceFactory: EventFeedSourceFactory
  fetch?: EventFeedFetcher
  initial?: {
    resourceRevisions?: readonly EventFeedResourceRevision[]
  }
  onError?: (result: Result<unknown>) => void
  onEvent?: (frame: GlobalSummarySseFrame) => void
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
  return `resource:${instruction.resourceType}:${instruction.resourceId}`
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

async function eventFeedAuthenticationStatusRead(
  fetcher: EventFeedFetcher | undefined,
): Promise<Result<number | undefined>> {
  if (fetcher === undefined) return createResult(undefined)
  try {
    const response = await fetcher(eventFeedAuthenticationPath, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Cache-Control": "no-store" },
    })
    return createResult(response.status)
  } catch (_error) {
    return createResultError("eventFeedAuthenticationStatusRead", "The authentication status could not be read.")
  }
}

function eventFeedAuthenticationStatusIsUnauthorized(status: number | undefined): boolean {
  return status !== undefined && eventFeedUnauthorizedStatuses.has(status)
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
    },
  })
  let currentCursor = cursor.data
  let browserOffline = false
  let transportState: EventFeedTransportState = "connecting"
  let closed = false
  let reconciliationEpoch = 0
  let reconnectAttempt = 0
  let source: EventFeedSource | null = null
  let sourceListeners = new Map<string, (event: StreamEventSourceEvent) => void>()
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
    try {
      current.onopen = null
    } catch (_error) {
      // Continue detaching an injected source when its handler cannot be cleared.
    }
    try {
      current.onerror = null
    } catch (_error) {
      // Continue detaching an injected source when its handler cannot be cleared.
    }
    for (const [eventType, listener] of sourceListeners) {
      try {
        current.removeEventListener(eventType, listener)
      } catch (_error) {
        // Continue closing an injected source when listener removal fails.
      }
    }
    sourceListeners = new Map()
    if (closeSource) {
      try {
        current.close()
      } catch (_error) {
        // A source that is already closed needs no further transport action.
      }
    }
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

    if (!epochCurrent(epoch)) return createResult(undefined)

    const resetCandidate = {
      asOfCursor: parsedBootstrap.output.asOfCursor,
      lastEventId: parsedBootstrap.output.lastEventId ?? parsedBootstrap.output.asOfCursor,
      resourceRevisions: [...stagedResourceRevisions.values()],
      resetCheckpoint: parsedBootstrap.output.resetCheckpoint,
    }
    const candidateValidated = feedState.resetValidate(resetCandidate)
    if (!candidateValidated.success) return candidateValidated

    const completed = feedState.resetCommit(resetCandidate)
    if (!completed.success) return completed
    currentCursor = resetCandidate.asOfCursor
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
      reconnect()
      online()
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

  const resetRequest = (resetReason: EventFeedReset["resetReason"]): void => {
    if (currentCursor === null) {
      transportStateSet("reconnecting")
      openTransport()
      return
    }
    const requested = feedState.resetRequest({ resetCheckpoint: currentCursor, resetReason })
    if (!requested.success) {
      errorReport(requested)
      return
    }
    pendingAdd(requested.data)
  }

  const closedSourceRecoveryRun = async (error: StreamEventSourceError): Promise<void> => {
    if (closed || browserOffline) return
    let status = error.status
    if (status === undefined) {
      const authentication = await eventFeedAuthenticationStatusRead(options.fetch)
      if (!authentication.success) {
        if (currentCursor !== null) resetRequest("cursor-invalid")
        return
      }
      status = authentication.data
    }

    if (closed || browserOffline || source !== null || resetProcessing) return
    if (eventFeedAuthenticationStatusIsUnauthorized(status)) {
      options.onAuthenticationError?.()
      return
    }
    if (currentCursor !== null) {
      resetRequest("cursor-invalid")
      return
    }
    transportStateSet("reconnecting")
    openTransport()
  }

  const eventApply = (frame: GlobalSummarySseFrame): Result<EventFeedApplyResult> => {
    const applied = feedState.apply(frame.data)
    if (!applied.success) return applied
    if (frame.data.eventType !== "reset" && applied.data.applied) currentCursor = frame.id
    if (applied.data.instruction !== null) pendingAdd(applied.data.instruction)
    stateEmit()
    return applied
  }

  const sourceEventHandle = (candidate: EventFeedSource, eventType: string, input: StreamEventSourceEvent): void => {
    if (closed || source !== candidate || resetProcessing) return
    const parsed = eventFeedEventParse({ data: input.data, event: eventType, id: input.lastEventId })
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
    const listeners = new Map<string, (event: StreamEventSourceEvent) => void>()
    sourceListeners = listeners
    created.onopen = () => {
      if (closed || source !== created) return
      reconnectAttempt = 0
      transportStateSet("open")
    }
    created.onerror = (error = {}) => {
      if (closed || source !== created || resetProcessing) return
      if (browserOffline || (typeof navigator !== "undefined" && navigator.onLine === false)) {
        sourceDetach(false)
        transportStateSet("closed")
        return
      }
      if (eventFeedAuthenticationStatusIsUnauthorized(error.status)) {
        sourceDetach(false)
        transportStateSet("closed")
        options.onAuthenticationError?.()
        return
      }
      if (error.status === eventFeedCursorFailureStatus) {
        sourceDetach(false)
        transportStateSet("closed")
        resetRequest("cursor-invalid")
        return
      }
      if (created.readyState === eventFeedClosedReadyState) {
        sourceDetach(false)
        transportStateSet("closed")
        void closedSourceRecoveryRun(error)
        return
      }
      reconnectAttempt += 1
      transportStateSet("reconnecting")
    }
    try {
      for (const eventType of eventFeedEventTypes) {
        const listener = (event: StreamEventSourceEvent) => sourceEventHandle(created, eventType, event)
        listeners.set(eventType, listener)
        created.addEventListener(eventType, listener)
      }
    } catch (_error) {
      sourceDetach(true)
      const result = createResultError("eventFeedCreate", "The event source listeners could not be installed.")
      errorReport(result)
      transportStateSet("closed")
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

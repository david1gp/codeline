import { createResult, createResultErrorCode, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import { apiRevisionSchema } from "../../api/schema/apiRevisionSchema.js"
import type { UiDataLayerStatus } from "../../ui/uiDataLayerStatusSchema.js"
import type { GlobalSummaryEvent } from "../schema/globalSummaryEventSchema.js"
import { globalSummaryEventSchema } from "../schema/globalSummaryEventSchema.js"
import { type EventFeedCursor, eventFeedCursorSchema } from "./eventFeedCursorSchema.js"
import { eventFeedEventParse } from "./eventFeedEventParse.js"

const eventFeedResourceTypeSchema = v.picklist(["agent", "message", "note", "run", "server", "session", "session-list"])
const eventFeedResourceSchema = v.strictObject({
  resourceId: apiPublicIdSchema,
  resourceType: eventFeedResourceTypeSchema,
})
const eventFeedResourceReplacementSchema = v.strictObject({
  ...eventFeedResourceSchema.entries,
  revision: apiRevisionSchema,
})
const eventFeedResetCompletionSchema = v.strictObject({
  asOfCursor: eventFeedCursorSchema,
  lastEventId: v.optional(v.nullable(eventFeedCursorSchema)),
  resetCheckpoint: eventFeedCursorSchema,
})
const eventFeedResetRequestSchema = v.strictObject({
  resetCheckpoint: eventFeedCursorSchema,
  resetReason: v.picklist(["cursor-expired", "cursor-invalid", "journal-unavailable"]),
})
const eventFeedBootstrapSchema = v.strictObject({
  asOfCursor: v.nullable(eventFeedCursorSchema),
  lastEventId: v.optional(v.nullable(eventFeedCursorSchema)),
})
const eventFeedResetCommitSchema = v.strictObject({
  asOfCursor: eventFeedCursorSchema,
  lastEventId: v.optional(v.nullable(eventFeedCursorSchema)),
  resourceRevisions: v.array(eventFeedResourceReplacementSchema),
  resetCheckpoint: eventFeedCursorSchema,
})

export type EventFeedResourceType = v.InferOutput<typeof eventFeedResourceTypeSchema>
export type EventFeedResource = v.InferOutput<typeof eventFeedResourceSchema>
export type EventFeedResourceRevision = v.InferOutput<typeof eventFeedResourceReplacementSchema>
export type EventFeedReconciliationInstruction =
  | {
      cachedRevision: number | null
      kind: "resource-stale"
      reason: "resource-stale"
      resourceId: string
      resourceType: EventFeedResourceType
      serverRevision: number
    }
  | {
      resetCheckpoint: EventFeedCursor
      kind: "reset"
      preserveBoundedCaches: true
      reason: "reset"
      resetReason: "cursor-expired" | "cursor-invalid" | "journal-unavailable"
      revalidateVisibleResources: true
    }
export type EventFeedStaleResource = EventFeedResource & {
  cachedRevision: number | null
  serverRevision: number
}
export type EventFeedState = {
  asOfCursor: string | null
  lastEventId: string | null
  resourceRevisions: ReadonlyMap<string, number>
  staleResources: ReadonlyMap<string, EventFeedStaleResource>
  status: UiDataLayerStatus
}
export type EventFeedApplyResult = {
  applied: boolean
  event: GlobalSummaryEvent
  ignored?: "duplicate" | "stale-event" | "stale-invalidation" | "reset-pending"
  instruction: EventFeedReconciliationInstruction | null
  state: EventFeedState
}
type EventFeedStateCreateOptions = {
  initial?: {
    asOfCursor?: string | null
    lastEventId?: string | null
    resourceRevisions?: readonly EventFeedResourceRevision[]
  }
}

const eventFeedMaximumTrackedResources = 1_024

function eventFeedStateError(message: string, code = "invalid_state") {
  return createResultErrorCode("eventFeedStateApply", message, code)
}

function eventFeedStateKey(resource: EventFeedResource): string {
  return `${resource.resourceType}:${resource.resourceId}`
}

function eventFeedStateInitialEventId(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const parsed = v.safeParse(eventFeedCursorSchema, value)
  return parsed.success ? parsed.output : null
}

function eventFeedStateResourceSet(map: Map<string, number>, key: string, revision: number): void {
  map.delete(key)
  map.set(key, revision)
  while (map.size > eventFeedMaximumTrackedResources) {
    const oldest = map.keys().next().value as string | undefined
    if (oldest === undefined) return
    map.delete(oldest)
  }
}

function eventFeedStateStaleSet(
  map: Map<string, EventFeedStaleResource>,
  key: string,
  resource: EventFeedStaleResource,
): void {
  map.delete(key)
  map.set(key, resource)
  while (map.size > eventFeedMaximumTrackedResources) {
    const oldest = map.keys().next().value as string | undefined
    if (oldest === undefined) return
    map.delete(oldest)
  }
}

export function eventFeedStateCreate(options: EventFeedStateCreateOptions) {
  const resourceRevisions = new Map<string, number>()
  const staleResources = new Map<string, EventFeedStaleResource>()
  const initialCursor = v.safeParse(v.nullable(eventFeedCursorSchema), options.initial?.asOfCursor ?? null)
  let asOfCursor = initialCursor.success ? initialCursor.output : null
  let lastEventId = eventFeedStateInitialEventId(options.initial?.lastEventId ?? options.initial?.asOfCursor)
  let latestGlobalSequence: number | undefined
  let bootstrapPending = options.initial?.asOfCursor === undefined || !initialCursor.success
  let resetPending: EventFeedReconciliationInstruction | null = null

  for (const resource of options.initial?.resourceRevisions ?? []) {
    const parsed = v.safeParse(eventFeedResourceReplacementSchema, resource)
    if (parsed.success)
      eventFeedStateResourceSet(resourceRevisions, eventFeedStateKey(parsed.output), parsed.output.revision)
  }

  const state = (): EventFeedState => ({
    asOfCursor,
    lastEventId,
    resourceRevisions: new Map(resourceRevisions),
    staleResources: new Map(staleResources),
    status: eventFeedStateStatusResolve(),
  })

  function eventFeedStateStatusResolve(): UiDataLayerStatus {
    if (resetPending !== null) return { status: "reconciling", reason: "reset" }
    const firstStale = staleResources.values().next().value as EventFeedStaleResource | undefined
    if (firstStale !== undefined) {
      return {
        cachedRevision: firstStale.cachedRevision ?? 0,
        resourceId: firstStale.resourceId,
        resourceType: firstStale.resourceType,
        serverRevision: firstStale.serverRevision,
        status: "stale",
      }
    }
    if (bootstrapPending) return { reason: "bootstrap", status: "reconciling" }
    return { asOfCursor, lastEventId, status: "connected" }
  }

  function eventFeedStateResourceInvalidation(
    resource: EventFeedResource & { revision: number },
  ): Result<{ ignored?: EventFeedApplyResult["ignored"]; instruction: EventFeedReconciliationInstruction | null }> {
    const key = eventFeedStateKey(resource)
    const cachedRevision = resourceRevisions.get(key)
    const pendingRevision = staleResources.get(key)?.serverRevision
    const knownRevision = Math.max(cachedRevision ?? -1, pendingRevision ?? -1)
    if (resource.revision <= knownRevision) return createResult({ ignored: "stale-invalidation", instruction: null })

    const stale: EventFeedStaleResource = {
      cachedRevision: cachedRevision ?? null,
      resourceId: resource.resourceId,
      resourceType: resource.resourceType,
      serverRevision: resource.revision,
    }
    eventFeedStateStaleSet(staleResources, key, stale)
    return createResult({
      instruction: {
        cachedRevision: stale.cachedRevision,
        kind: "resource-stale",
        reason: "resource-stale",
        resourceId: stale.resourceId,
        resourceType: stale.resourceType,
        serverRevision: stale.serverRevision,
      },
    })
  }

  function eventFeedStateEventApply(
    event: GlobalSummaryEvent,
  ): Result<{ ignored?: EventFeedApplyResult["ignored"]; instruction: EventFeedReconciliationInstruction | null }> {
    if (event.eventType === "invalidate") return eventFeedStateResourceInvalidation(event)
    if (event.eventType === "input-needed")
      return eventFeedStateResourceInvalidation({
        resourceId: event.sessionId,
        resourceType: "session",
        revision: event.sessionRevision,
      })
    return createResult({ instruction: null })
  }

  const apply = (input: unknown): Result<EventFeedApplyResult> => {
    const parsed = v.safeParse(globalSummaryEventSchema, input)
    if (!parsed.success)
      return eventFeedStateError(
        "The event does not match the global summary event contract.",
        v.summarize(parsed.issues),
      )
    const event = parsed.output
    const cursor = v.safeParse(eventFeedCursorSchema, event.id)
    if (!cursor.success) return eventFeedStateError("The event cursor is not an opaque feed cursor.", "invalid_cursor")
    if (latestGlobalSequence !== undefined && event.globalSequence <= latestGlobalSequence) {
      return createResult({
        applied: false,
        event,
        ignored: event.globalSequence === latestGlobalSequence ? "duplicate" : "stale-event",
        instruction: null,
        state: state(),
      })
    }
    if (resetPending !== null) {
      return createResult({ applied: false, event, ignored: "reset-pending", instruction: null, state: state() })
    }

    const applied = eventFeedStateEventApply(event)
    if (!applied.success) return applied
    if (event.eventType === "reset") {
      const reset = {
        resetCheckpoint: event.id,
        kind: "reset" as const,
        preserveBoundedCaches: true as const,
        reason: "reset" as const,
        resetReason: event.reason,
        revalidateVisibleResources: true as const,
      }
      resetPending = reset
      return createResult({ applied: true, event, instruction: reset, state: state() })
    }

    lastEventId = event.id
    asOfCursor = event.id
    latestGlobalSequence = event.globalSequence
    bootstrapPending = false
    return createResult({
      applied: true,
      event,
      ...(applied.data.ignored === undefined ? {} : { ignored: applied.data.ignored }),
      instruction: applied.data.instruction,
      state: state(),
    })
  }

  const applySse = (input: unknown): Result<EventFeedApplyResult> => {
    const parsed = eventFeedEventParse(input)
    if (!parsed.success) return parsed
    return apply(parsed.data.data)
  }

  const bootstrap = (input: unknown): Result<EventFeedState> => {
    const parsed = v.safeParse(eventFeedBootstrapSchema, input)
    if (!parsed.success)
      return eventFeedStateError("The bootstrap cursor does not match its contract.", "invalid_bootstrap")
    asOfCursor = parsed.output.asOfCursor
    lastEventId = eventFeedStateInitialEventId(parsed.output.lastEventId ?? parsed.output.asOfCursor)
    latestGlobalSequence = undefined
    bootstrapPending = false
    resetPending = null
    return createResult(state())
  }

  const resourceReplace = (input: unknown): Result<EventFeedState> => {
    const parsed = v.safeParse(eventFeedResourceReplacementSchema, input)
    if (!parsed.success)
      return eventFeedStateError("The authoritative resource revision is invalid.", "invalid_replacement")
    const resource = parsed.output
    const key = eventFeedStateKey(resource)
    const current = resourceRevisions.get(key)
    if (current !== undefined && resource.revision < current)
      return eventFeedStateError(
        "The authoritative resource revision is older than the cached revision.",
        "stale_replacement",
      )
    eventFeedStateResourceSet(resourceRevisions, key, resource.revision)
    const stale = staleResources.get(key)
    if (stale !== undefined && resource.revision >= stale.serverRevision) staleResources.delete(key)
    return createResult(state())
  }

  const resourceRevisionsReplace = (input: unknown): Result<EventFeedState> => {
    const parsed = v.safeParse(v.array(eventFeedResourceReplacementSchema), input)
    if (!parsed.success)
      return eventFeedStateError("The authoritative resource revisions are invalid.", "invalid_replacement")

    resourceRevisions.clear()
    staleResources.clear()
    for (const resource of parsed.output)
      eventFeedStateResourceSet(resourceRevisions, eventFeedStateKey(resource), resource.revision)
    return createResult(state())
  }

  const resetCommitPrepare = (
    input: unknown,
  ): Result<{ resourceRevisions: Map<string, number>; value: v.InferOutput<typeof eventFeedResetCommitSchema> }> => {
    const parsed = v.safeParse(eventFeedResetCommitSchema, input)
    if (!parsed.success)
      return eventFeedStateError("The reset reconciliation result is invalid.", "invalid_reconciliation")
    if (resetPending === null || resetPending.kind !== "reset")
      return eventFeedStateError("There is no reset reconciliation pending.", "invalid_reconciliation")
    if (parsed.output.resetCheckpoint !== resetPending.resetCheckpoint)
      return eventFeedStateError("The reset reconciliation is bound to another checkpoint.", "invalid_reconciliation")

    const nextResourceRevisions = new Map<string, number>()
    for (const resource of parsed.output.resourceRevisions)
      eventFeedStateResourceSet(nextResourceRevisions, eventFeedStateKey(resource), resource.revision)
    return createResult({ resourceRevisions: nextResourceRevisions, value: parsed.output })
  }

  const resetValidate = (input: unknown): Result<void> => {
    const prepared = resetCommitPrepare(input)
    if (!prepared.success) return prepared
    return createResult(undefined)
  }

  const resetRequest = (input: unknown): Result<EventFeedReconciliationInstruction> => {
    const parsed = v.safeParse(eventFeedResetRequestSchema, input)
    if (!parsed.success) return eventFeedStateError("The reset request is invalid.", "invalid_reconciliation")
    if (resetPending !== null) return createResult(resetPending)
    resetPending = {
      resetCheckpoint: parsed.output.resetCheckpoint,
      kind: "reset",
      preserveBoundedCaches: true,
      reason: "reset",
      resetReason: parsed.output.resetReason,
      revalidateVisibleResources: true,
    }
    return createResult(resetPending)
  }

  const resetComplete = (input: unknown): Result<EventFeedState> => {
    const parsed = v.safeParse(eventFeedResetCompletionSchema, input)
    if (!parsed.success)
      return eventFeedStateError("The reset reconciliation result is invalid.", "invalid_reconciliation")
    if (resetPending === null || resetPending.kind !== "reset")
      return eventFeedStateError("There is no reset reconciliation pending.", "invalid_reconciliation")
    if (parsed.output.resetCheckpoint !== resetPending.resetCheckpoint)
      return eventFeedStateError("The reset reconciliation is bound to another checkpoint.", "invalid_reconciliation")
    asOfCursor = parsed.output.asOfCursor
    lastEventId = eventFeedStateInitialEventId(parsed.output.lastEventId ?? parsed.output.asOfCursor)
    latestGlobalSequence = undefined
    bootstrapPending = false
    resetPending = null
    return createResult(state())
  }

  const resetCommit = (input: unknown): Result<EventFeedState> => {
    const prepared = resetCommitPrepare(input)
    if (!prepared.success) return prepared

    resourceRevisions.clear()
    for (const [key, revision] of prepared.data.resourceRevisions) resourceRevisions.set(key, revision)
    staleResources.clear()
    asOfCursor = prepared.data.value.asOfCursor
    lastEventId = eventFeedStateInitialEventId(prepared.data.value.lastEventId ?? prepared.data.value.asOfCursor)
    latestGlobalSequence = undefined
    bootstrapPending = false
    resetPending = null
    return createResult(state())
  }

  return {
    apply,
    applySse,
    bootstrap,
    resetCommit,
    resetComplete,
    resetValidate,
    resetRequest,
    resourceReplace,
    resourceRevisionsReplace,
    state,
  }
}

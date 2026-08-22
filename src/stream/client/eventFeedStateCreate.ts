import { createResult, createResultErrorCode, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import { apiRevisionSchema } from "../../api/schema/apiRevisionSchema.js"
import { type RunActiveSummary, runActiveSummarySchema } from "../../run/api/runActiveSummarySchema.js"
import { sessionSnapshotResponseSchema } from "../../session/api/sessionSnapshotResponseSchema.js"
import type { UiDataLayerStatus } from "../../ui/uiDataLayerStatusSchema.js"
import type { JournalEvent } from "../schema/journalEventSchema.js"
import { journalEventSchema } from "../schema/journalEventSchema.js"
import { type EventFeedCursor, eventFeedCursorSchema } from "./eventFeedCursorSchema.js"
import { eventFeedEventParse } from "./eventFeedEventParse.js"

const eventFeedResourceTypeSchema = v.picklist(["agent", "message", "note", "run", "server", "session", "session-list"])
const eventFeedDeltaKindSchema = v.picklist(["text", "thinking", "tool"])
const eventFeedRunCheckpointSchema = v.picklist(["completed", "failed", "cancelled", "interrupted"])

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
const eventFeedBootstrapSchema = v.strictObject({
  asOfCursor: v.nullable(eventFeedCursorSchema),
  lastEventId: v.optional(v.nullable(eventFeedCursorSchema)),
})
const eventFeedActiveRunsSchema = v.array(runActiveSummarySchema)
const eventFeedResetCommitSchema = v.strictObject({
  activeRuns: eventFeedActiveRunsSchema,
  asOfCursor: eventFeedCursorSchema,
  lastEventId: v.optional(v.nullable(eventFeedCursorSchema)),
  resourceRevisions: v.array(eventFeedResourceReplacementSchema),
  resetCheckpoint: eventFeedCursorSchema,
  sessionSnapshots: v.array(sessionSnapshotResponseSchema),
})

export type EventFeedResourceType = v.InferOutput<typeof eventFeedResourceTypeSchema>
export type EventFeedDeltaKind = v.InferOutput<typeof eventFeedDeltaKindSchema>
export type EventFeedRunCheckpoint = v.InferOutput<typeof eventFeedRunCheckpointSchema>
export type EventFeedResource = v.InferOutput<typeof eventFeedResourceSchema>
export type EventFeedResourceRevision = v.InferOutput<typeof eventFeedResourceReplacementSchema>
export type EventFeedRun = {
  checkpoint: EventFeedRunCheckpoint | null
  deltaTextByKind: Record<EventFeedDeltaKind, string>
  deltas: Array<EventFeedDelta>
  lastSequence: number
  phase: "active" | "reconciling" | "settled"
  partialText: string
  runId: string
  sessionId: string
  superseded: boolean
  terminalStatus: "succeeded" | "failed" | "aborted" | null
}
export type EventFeedStaleResource = EventFeedResource & {
  cachedRevision: number | null
  serverRevision: number
}
export type EventFeedDelta = {
  delta: string
  deltaKind: EventFeedDeltaKind
  messageId: string | null
  sequence: number
}
export type EventFeedReconciliationInstruction =
  | {
      authoritative: "session-snapshot"
      kind: "authoritative-replacement"
      messageId: string | null
      preserveDeltas: false
      reason: "run-completed"
      runId: string
      sessionId: string
      sessionRevision: number
    }
  | {
      authoritative: "active-run-snapshot"
      checkpoint: "failed" | "cancelled" | "interrupted"
      kind: "run-checkpoint"
      preserveDeltas: true
      reason: "run-checkpoint"
      runId: string
      sessionId: string
      sessionRevision: number
    }
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
      preserveSettledCaches: true
      reason: "reset"
      resetReason: "cursor-expired" | "cursor-invalid" | "journal-unavailable"
      reconcileActiveRuns: true
      revalidateVisibleResources: true
    }
export type EventFeedState = {
  activeRuns: ReadonlyMap<string, EventFeedRun>
  asOfCursor: string | null
  lastEventId: string | null
  resourceRevisions: ReadonlyMap<string, number>
  settledCacheKeys: readonly string[]
  staleResources: ReadonlyMap<string, EventFeedStaleResource>
  status: UiDataLayerStatus
}
export type EventFeedApplyResult = {
  applied: boolean
  event: JournalEvent
  ignored?: "duplicate" | "stale-event" | "stale-invalidation" | "terminal-run" | "reset-pending"
  instruction: EventFeedReconciliationInstruction | null
  state: EventFeedState
}
type EventFeedStateCreateOptions = {
  initial?: {
    asOfCursor?: string | null
    lastEventId?: string | null
    resourceRevisions?: readonly EventFeedResourceRevision[]
    settledCacheKeys?: readonly string[]
  }
}

function eventFeedStateError(message: string, code = "invalid_state") {
  return createResultErrorCode("eventFeedStateApply", message, code)
}

function eventFeedStateKey(resource: EventFeedResource): string {
  return `${resource.resourceType}:${resource.resourceId}`
}

function eventFeedStateDeltaTextCreate(): Record<EventFeedDeltaKind, string> {
  return { text: "", thinking: "", tool: "" }
}

function eventFeedStateRunClone(run: EventFeedRun): EventFeedRun {
  return {
    checkpoint: run.checkpoint,
    deltaTextByKind: { ...run.deltaTextByKind },
    deltas: run.deltas.map((delta) => ({ ...delta })),
    lastSequence: run.lastSequence,
    phase: run.phase,
    partialText: run.partialText,
    runId: run.runId,
    sessionId: run.sessionId,
    superseded: run.superseded,
    terminalStatus: run.terminalStatus,
  }
}

function eventFeedStateInitialEventId(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const parsed = v.safeParse(eventFeedCursorSchema, value)
  return parsed.success ? parsed.output : null
}

export function eventFeedStateCreate(options: EventFeedStateCreateOptions) {
  const activeRuns = new Map<string, EventFeedRun>()
  const resourceRevisions = new Map<string, number>()
  const staleResources = new Map<string, EventFeedStaleResource>()
  const seenEventIds = new Set<string>()
  const settledCacheKeys = [...(options.initial?.settledCacheKeys ?? [])]
  const initialCursor = v.safeParse(v.nullable(eventFeedCursorSchema), options.initial?.asOfCursor ?? null)
  let asOfCursor = initialCursor.success ? initialCursor.output : null
  let lastEventId = eventFeedStateInitialEventId(options.initial?.lastEventId ?? options.initial?.asOfCursor)
  let latestEventSequence: number | undefined
  let bootstrapPending = options.initial?.asOfCursor === undefined || !initialCursor.success
  let resetPending: EventFeedReconciliationInstruction | null = null

  for (const resource of options.initial?.resourceRevisions ?? []) {
    const parsed = v.safeParse(eventFeedResourceReplacementSchema, resource)
    if (parsed.success) resourceRevisions.set(eventFeedStateKey(parsed.output), parsed.output.revision)
  }

  const state = (): EventFeedState => {
    const runs = new Map<string, EventFeedRun>()
    for (const [runId, run] of activeRuns) runs.set(runId, eventFeedStateRunClone(run))

    const stale = new Map<string, EventFeedStaleResource>()
    for (const [key, resource] of staleResources) stale.set(key, { ...resource })

    return {
      activeRuns: runs,
      asOfCursor,
      lastEventId,
      resourceRevisions: new Map(resourceRevisions),
      settledCacheKeys: [...settledCacheKeys],
      staleResources: stale,
      status: eventFeedStateStatusResolve(),
    }
  }

  function eventFeedStateStatusResolve(): UiDataLayerStatus {
    if (resetPending !== null) return { status: "reconciling", reason: "reset" }
    for (const run of activeRuns.values()) {
      if (run.phase === "reconciling") return { status: "reconciling", reason: "run-checkpoint" }
    }
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

  function eventFeedStateRunEnsure(
    event: Extract<
      JournalEvent,
      { eventType: "delta" | "run-completed" | "run-failed" | "run-cancelled" | "run-interrupted" }
    >,
  ): Result<EventFeedRun> {
    const existing = activeRuns.get(event.runId)
    if (existing !== undefined) {
      if (existing.sessionId !== event.sessionId) return eventFeedStateError("The run belongs to another session.")
      return createResult(existing)
    }

    const run: EventFeedRun = {
      checkpoint: null,
      deltaTextByKind: eventFeedStateDeltaTextCreate(),
      deltas: [],
      lastSequence: event.sequence,
      phase: "active",
      partialText: "",
      runId: event.runId,
      sessionId: event.sessionId,
      superseded: false,
      terminalStatus: null,
    }
    activeRuns.set(event.runId, run)
    return createResult(run)
  }

  function eventFeedStateEventApply(
    event: JournalEvent,
  ): Result<{ ignored?: EventFeedApplyResult["ignored"]; instruction: EventFeedReconciliationInstruction | null }> {
    if (event.eventType === "invalidate") {
      const key = eventFeedStateKey(event)
      const cachedRevision = resourceRevisions.get(key)
      const pendingRevision = staleResources.get(key)?.serverRevision
      const knownRevision = Math.max(cachedRevision ?? -1, pendingRevision ?? -1)
      if (event.revision <= knownRevision) return createResult({ ignored: "stale-invalidation", instruction: null })

      const stale: EventFeedStaleResource = {
        cachedRevision: cachedRevision ?? null,
        resourceId: event.resourceId,
        resourceType: event.resourceType,
        serverRevision: event.revision,
      }
      staleResources.set(key, stale)
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

    if (event.eventType === "delta") {
      const ensured = eventFeedStateRunEnsure(event)
      if (!ensured.success) return ensured
      const run = ensured.data
      if (run.phase !== "active" || run.superseded) return createResult({ ignored: "terminal-run", instruction: null })

      run.deltas.push({
        delta: event.delta,
        deltaKind: event.deltaKind,
        messageId: event.messageId,
        sequence: event.sequence,
      })
      run.lastSequence = event.sequence
      run.deltaTextByKind[event.deltaKind] += event.delta
      if (event.deltaKind === "text") run.partialText += event.delta
      return createResult({ instruction: null })
    }

    if (event.eventType === "reset") return createResult({ instruction: null })

    const ensured = eventFeedStateRunEnsure(event)
    if (!ensured.success) return ensured
    const run = ensured.data
    run.lastSequence = event.sequence
    run.phase = "reconciling"
    run.terminalStatus =
      event.eventType === "run-completed" ? "succeeded" : event.eventType === "run-failed" ? "failed" : "aborted"
    run.superseded = event.eventType === "run-completed"
    if (run.superseded) {
      run.checkpoint = "completed"
      run.deltas = []
      run.deltaTextByKind = eventFeedStateDeltaTextCreate()
      run.partialText = ""
    }

    if (event.eventType === "run-completed") {
      return createResult({
        instruction: {
          authoritative: "session-snapshot",
          kind: "authoritative-replacement",
          messageId: event.messageId,
          preserveDeltas: false,
          reason: "run-completed",
          runId: event.runId,
          sessionId: event.sessionId,
          sessionRevision: event.sessionRevision,
        },
      })
    }

    const checkpoint =
      event.eventType === "run-failed" ? "failed" : event.eventType === "run-cancelled" ? "cancelled" : "interrupted"
    run.checkpoint = checkpoint
    return createResult({
      instruction: {
        authoritative: "active-run-snapshot",
        checkpoint,
        kind: "run-checkpoint",
        preserveDeltas: true,
        reason: "run-checkpoint",
        runId: event.runId,
        sessionId: event.sessionId,
        sessionRevision: event.sessionRevision,
      },
    })
  }

  const apply = (input: unknown): Result<EventFeedApplyResult> => {
    const parsed = v.safeParse(journalEventSchema, input)
    if (!parsed.success)
      return eventFeedStateError(
        "The event does not match the shared journal event contract.",
        v.summarize(parsed.issues),
      )
    const event = parsed.output
    const cursor = v.safeParse(eventFeedCursorSchema, event.id)
    if (!cursor.success) return eventFeedStateError("The event cursor is not an opaque feed cursor.", "invalid_cursor")
    if (seenEventIds.has(event.id)) {
      return createResult({ applied: false, event, ignored: "duplicate", instruction: null, state: state() })
    }
    if (latestEventSequence !== undefined && event.sequence <= latestEventSequence) {
      seenEventIds.add(event.id)
      return createResult({ applied: false, event, ignored: "stale-event", instruction: null, state: state() })
    }
    if (resetPending !== null) {
      seenEventIds.add(event.id)
      return createResult({ applied: false, event, ignored: "reset-pending", instruction: null, state: state() })
    }

    const applied = eventFeedStateEventApply(event)
    if (!applied.success) return applied
    seenEventIds.add(event.id)
    const instruction = applied.data.instruction

    if (event.eventType === "reset") {
      const reset = {
        resetCheckpoint: event.id,
        kind: "reset" as const,
        preserveSettledCaches: true as const,
        reason: "reset" as const,
        resetReason: event.reason,
        reconcileActiveRuns: true as const,
        revalidateVisibleResources: true as const,
      }
      resetPending = reset
      return createResult({ applied: true, event, instruction: reset, state: state() })
    }

    lastEventId = event.id
    asOfCursor = event.id
    latestEventSequence = event.sequence
    bootstrapPending = false
    return createResult({
      applied: true,
      event,
      ...(applied.data.ignored === undefined ? {} : { ignored: applied.data.ignored }),
      instruction,
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
    latestEventSequence = undefined
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
    resourceRevisions.set(key, resource.revision)
    const stale = staleResources.get(key)
    if (stale !== undefined && resource.revision >= stale.serverRevision) staleResources.delete(key)
    return createResult(state())
  }

  const resourceRevisionsReplace = (input: unknown): Result<EventFeedState> => {
    const parsed = v.safeParse(v.array(eventFeedResourceReplacementSchema), input)
    if (!parsed.success)
      return eventFeedStateError("The authoritative resource revisions are invalid.", "invalid_replacement")

    const replacements = new Map<string, number>()
    for (const resource of parsed.output) replacements.set(eventFeedStateKey(resource), resource.revision)

    resourceRevisions.clear()
    staleResources.clear()
    for (const [key, revision] of replacements) resourceRevisions.set(key, revision)
    return createResult(state())
  }

  const sessionReplace = (input: unknown): Result<EventFeedState> => {
    const parsed = v.safeParse(sessionSnapshotResponseSchema, input)
    if (!parsed.success)
      return eventFeedStateError("The authoritative session snapshot is invalid.", "invalid_replacement")
    const replacement = {
      resourceId: parsed.output.session.id,
      resourceType: "session" as const,
      revision: parsed.output.revision,
    }
    const replaced = resourceReplace(replacement)
    if (!replaced.success) return replaced
    for (const [runId, run] of activeRuns) {
      if (run.sessionId === parsed.output.session.id) activeRuns.delete(runId)
    }
    return createResult(state())
  }

  const eventFeedStateRunCreate = (snapshot: RunActiveSummary, existing?: EventFeedRun): Result<EventFeedRun> => {
    if (existing !== undefined && existing.sessionId !== snapshot.sessionId)
      return eventFeedStateError("The run belongs to another session.")
    const terminalStatus =
      snapshot.status === "succeeded" || snapshot.status === "failed" || snapshot.status === "aborted"
        ? snapshot.status
        : null
    const terminal = terminalStatus !== null
    return createResult({
      checkpoint: existing?.checkpoint ?? null,
      deltaTextByKind: { text: snapshot.partialText, thinking: "", tool: "" },
      deltas: [],
      lastSequence: snapshot.lastSequence,
      phase: terminal ? "settled" : "active",
      partialText: snapshot.partialText,
      runId: snapshot.runId,
      sessionId: snapshot.sessionId,
      superseded: false,
      terminalStatus,
    })
  }

  const runReplace = (input: unknown): Result<EventFeedState> => {
    const parsed = v.safeParse(runActiveSummarySchema, input)
    if (!parsed.success) return eventFeedStateError("The authoritative run snapshot is invalid.", "invalid_replacement")
    const snapshot = parsed.output
    const run = eventFeedStateRunCreate(snapshot, activeRuns.get(snapshot.runId))
    if (!run.success) return run
    activeRuns.set(snapshot.runId, run.data)
    return createResult(state())
  }

  const activeRunsReplace = (input: unknown): Result<EventFeedState> => {
    const parsed = v.safeParse(eventFeedActiveRunsSchema, input)
    if (!parsed.success) return eventFeedStateError("The active run bootstrap is invalid.", "invalid_replacement")
    const replacements = new Map<string, EventFeedRun>()
    for (const snapshot of parsed.output) {
      const run = eventFeedStateRunCreate(snapshot, replacements.get(snapshot.runId))
      if (!run.success) return run
      replacements.set(snapshot.runId, run.data)
    }
    activeRuns.clear()
    for (const [runId, run] of replacements) activeRuns.set(runId, run)
    return createResult(state())
  }

  const resetCommitPrepare = (
    input: unknown,
  ): Result<{
    activeRuns: Map<string, EventFeedRun>
    resourceRevisions: Map<string, number>
    value: v.InferOutput<typeof eventFeedResetCommitSchema>
  }> => {
    const parsed = v.safeParse(eventFeedResetCommitSchema, input)
    if (!parsed.success)
      return eventFeedStateError("The reset reconciliation result is invalid.", "invalid_reconciliation")
    const pendingReset = resetPending
    if (pendingReset === null || pendingReset.kind !== "reset")
      return eventFeedStateError("There is no reset reconciliation pending.", "invalid_reconciliation")
    if (parsed.output.resetCheckpoint !== pendingReset.resetCheckpoint)
      return eventFeedStateError("The reset reconciliation is bound to another checkpoint.", "invalid_reconciliation")

    const nextResourceRevisions = new Map<string, number>()
    for (const resource of parsed.output.resourceRevisions)
      nextResourceRevisions.set(eventFeedStateKey(resource), resource.revision)

    const nextActiveRuns = new Map<string, EventFeedRun>()
    for (const snapshot of parsed.output.activeRuns) {
      const run = eventFeedStateRunCreate(snapshot, nextActiveRuns.get(snapshot.runId))
      if (!run.success) return run
      nextActiveRuns.set(snapshot.runId, run.data)
    }
    for (const snapshot of parsed.output.sessionSnapshots) {
      nextResourceRevisions.set(`session:${snapshot.session.id}`, snapshot.revision)
      for (const [runId, run] of nextActiveRuns) {
        if (run.sessionId === snapshot.session.id) nextActiveRuns.delete(runId)
      }
    }
    return createResult({ activeRuns: nextActiveRuns, resourceRevisions: nextResourceRevisions, value: parsed.output })
  }

  const resetValidate = (input: unknown): Result<void> => {
    const prepared = resetCommitPrepare(input)
    if (!prepared.success) return prepared
    return createResult(undefined)
  }

  const resetComplete = (input: unknown): Result<EventFeedState> => {
    const parsed = v.safeParse(eventFeedResetCompletionSchema, input)
    if (!parsed.success)
      return eventFeedStateError("The reset reconciliation result is invalid.", "invalid_reconciliation")
    const pendingReset = resetPending
    if (pendingReset === null || pendingReset.kind !== "reset")
      return eventFeedStateError("There is no reset reconciliation pending.", "invalid_reconciliation")
    if (parsed.output.resetCheckpoint !== pendingReset.resetCheckpoint)
      return eventFeedStateError("The reset reconciliation is bound to another checkpoint.", "invalid_reconciliation")
    asOfCursor = parsed.output.asOfCursor
    lastEventId = eventFeedStateInitialEventId(parsed.output.lastEventId ?? parsed.output.asOfCursor)
    latestEventSequence = undefined
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
    activeRuns.clear()
    for (const [runId, run] of prepared.data.activeRuns) activeRuns.set(runId, run)
    asOfCursor = prepared.data.value.asOfCursor
    lastEventId = eventFeedStateInitialEventId(prepared.data.value.lastEventId ?? prepared.data.value.asOfCursor)
    latestEventSequence = undefined
    bootstrapPending = false
    resetPending = null
    return createResult(state())
  }

  return {
    activeRunsReplace,
    apply,
    applySse,
    bootstrap,
    resetCommit,
    resetComplete,
    resetValidate,
    resourceReplace,
    resourceRevisionsReplace,
    runReplace,
    sessionReplace,
    state,
  }
}

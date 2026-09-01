import type { SessionCompactRunInputState } from "../session/api/sessionCompactRunInputStateSchema.js"
import type { SessionDetailEvent } from "../session/api/sessionDetailEventSchema.js"
import type { SessionSemanticStep } from "../session/api/sessionSemanticStepSchema.js"
import {
  type SessionStreamDelegation,
  type SessionStreamGroup,
  sessionStreamGroupsDerive,
} from "./sessionStreamGroupsDerive.js"
import { sessionStreamInFlightDerive } from "./sessionStreamInFlightDerive.js"
import type { TransientActivity } from "./transientMessageActivitiesResolve.js"

type SessionDetailEntryEvent = Extract<SessionDetailEvent, { eventType: "entry" }>
type SessionStreamInput = Parameters<typeof sessionStreamGroupsDerive>[0]

type SessionStreamStateOptions = {
  boundedState?: () => SessionCompactRunInputState | undefined
  delegations: () => ReadonlyArray<SessionStreamDelegation>
  detailEntries?: () => readonly SessionDetailEntryEvent[]
  inFlightRunId: () => string | null
  inFlightMessages: () => ReadonlyArray<{
    activities?: ReadonlyArray<TransientActivity>
    content: string
    id?: string
    role: string
  }>
  isEnabled: () => boolean
  semanticSteps?: () => readonly SessionSemanticStep[]
  sessionId: () => string | undefined
}

function sessionStreamPayloadRecord(payload: unknown): Record<string, unknown> {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return {}
  return payload as Record<string, unknown>
}

function sessionStreamStatusResolve(payload: Record<string, unknown>, fallback: string): string {
  return typeof payload.status === "string"
    ? payload.status
    : typeof payload.outcome === "string"
      ? payload.outcome
      : fallback
}

function sessionStreamDetailInputResolve(
  sessionId: string | undefined,
  boundedState: SessionCompactRunInputState | undefined,
  detailEntries: readonly SessionDetailEntryEvent[],
  semanticSteps: readonly SessionSemanticStep[],
): SessionStreamInput {
  if (sessionId === undefined) return { delegations: [], events: [], runs: [] }
  const runs = new Map<string, SessionStreamInput["runs"][number]>()
  const events: Array<SessionStreamInput["events"][number]> = []
  for (const step of semanticSteps) {
    if (step.kind !== "run") continue
    const status = step.terminalKind ?? step.status ?? "running"
    runs.set(step.detailId, {
      attempts: [{ ordinal: 1, status, streamId: step.detailId }],
      clientRunId: step.detailId,
      createdAt: step.sequence,
      id: step.detailId,
      status,
      streamId: step.detailId,
      ...(step.terminalKind === undefined ? {} : { terminal: { id: step.id, kind: step.terminalKind } }),
    })
  }
  const activeRun = boundedState?.run?.sessionId === sessionId ? boundedState.run : undefined
  if (activeRun !== undefined) {
    runs.set(activeRun.runId, {
      attempts: [{ ordinal: 1, status: activeRun.status, streamId: activeRun.runId }],
      clientRunId: activeRun.runId,
      createdAt: 0,
      id: activeRun.runId,
      status: activeRun.status,
      streamId: activeRun.runId,
    })
    if (activeRun.partialText.length > 0)
      events.push({
        createdAt: 0,
        eventType: "text_delta",
        id: `${activeRun.runId}:snapshot`,
        payload: { delta: activeRun.partialText },
        sequence: activeRun.lastSequence,
        streamId: activeRun.runId,
      })
  }

  for (const entry of detailEntries) {
    if (entry.sessionId !== sessionId || entry.kind === "message") continue
    const payload = sessionStreamPayloadRecord(entry.payload)
    const runId =
      entry.kind === "run" ? entry.sourceId : typeof payload.runId === "string" ? payload.runId : entry.sourceId
    const terminalKind =
      entry.kind === "run" &&
      typeof payload.terminalKind === "string" &&
      ["cancelled", "completed", "failed", "interrupted"].includes(payload.terminalKind)
        ? (payload.terminalKind as "cancelled" | "completed" | "failed" | "interrupted")
        : undefined
    const status = terminalKind ?? sessionStreamStatusResolve(payload, "running")
    const existing = runs.get(runId)
    runs.set(runId, {
      attempts: [{ ordinal: 1, status, streamId: runId }],
      clientRunId: runId,
      createdAt: existing?.createdAt ?? entry.position,
      id: runId,
      status,
      streamId: runId,
      ...(terminalKind !== undefined
        ? { terminal: { id: entry.entryId, kind: terminalKind } }
        : existing?.terminal === undefined
          ? {}
          : { terminal: existing.terminal }),
    })
    if (entry.kind === "tool") {
      events.push({
        createdAt: entry.position,
        eventType: "tool_start",
        id: entry.entryId,
        payload: {
          toolCallId: typeof payload.toolCallId === "string" ? payload.toolCallId : entry.sourceDetailId,
          toolName: typeof payload.toolName === "string" ? payload.toolName : "Tool",
        },
        sequence: entry.changePosition,
        streamId: runId,
      })
      continue
    }
  }
  return { events, runs: [...runs.values()] }
}

export function sessionStreamStateCreate(options: SessionStreamStateOptions) {
  const activeSessionId = () => (options.isEnabled() ? options.sessionId() : undefined)
  const durableEntryCache: NonNullable<SessionStreamInput["entryCache"]> = new Map()
  let durableEntryCacheSessionId: string | undefined
  const feedInput = () =>
    sessionStreamDetailInputResolve(
      activeSessionId(),
      options.boundedState?.(),
      options.detailEntries?.() ?? [],
      options.semanticSteps?.() ?? [],
    )
  const durableGroups = () => {
    const sessionId = activeSessionId()
    if (sessionId !== durableEntryCacheSessionId) {
      durableEntryCache.clear()
      durableEntryCacheSessionId = sessionId
    }
    return sessionStreamGroupsDerive({
      ...feedInput(),
      delegations: options.delegations(),
      entryCache: durableEntryCache,
    })
  }
  const inFlightScope = () => {
    if (activeSessionId() === undefined) return undefined
    const runId = options.inFlightRunId()
    return runId === null ? undefined : { parentRunId: runId }
  }
  const revalidate = () => undefined

  return {
    groups: (): ReadonlyArray<SessionStreamGroup> => {
      const input = feedInput()
      const inFlight = sessionStreamInFlightDerive(
        options.inFlightMessages(),
        options.delegations(),
        inFlightScope(),
        input.runs,
      )
      return inFlight === undefined ? durableGroups() : [...durableGroups(), inFlight]
    },
    isLoading: () => false,
    refresh: revalidate,
    revalidate,
  }
}

export type SessionStreamState = ReturnType<typeof sessionStreamStateCreate>

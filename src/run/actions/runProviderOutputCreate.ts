import { createHash } from "node:crypto"
import { createResult, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import * as v from "valibot"
import type { DatabaseExecutor, DatabaseTransaction } from "../../database/databaseClient.js"
import type { journalEventsAppendPersist } from "../../journal/actions/journalEventsAppendPersist.js"
import type { journalPostCommitPublishCreate } from "../../journal/actions/journalPostCommitPublishCreate.js"
import type { journalRunDeltasDelete } from "../../journal/actions/journalRunDeltasDelete.js"
import { journalRunFinalize } from "../../journal/actions/journalRunFinalize.js"
import { journalWriteCreate } from "../../journal/actions/journalWriteCreate.js"
import { messageAppend } from "../../message/actions/messageAppend.js"
import type { CompactionTokenUsage } from "../../compaction/compactionTokenUsage.js"
import { compactionTokenUsageMetadataCreate } from "../../compaction/compactionTokenUsageMetadataCreate.js"
import { providerExecutionEventFromStreamChunk } from "../../providers/runtime/providerExecutionEventFromStreamChunk.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import { sessionHistoryEntryRepositoryUpsert } from "../../session/db/sessionHistoryEntryRepositoryUpsert.js"
import { sessionHistoryEntryTable } from "../../session/db/sessionHistoryEntryTable.js"
import { executionStreamEventNormalize } from "../../stream/actions/executionStreamEventNormalize.js"
import { executionToolPayloadBound } from "../../stream/actions/executionToolPayloadBound.js"
import { streamProducerCoalescerCreate } from "../../stream/actions/streamProducerCoalescerCreate.js"
import {
  type ExecutionStreamEvent,
  executionStreamEventSchema,
} from "../../stream/schema/executionStreamEventSchema.js"
import type { StreamProducerDelta } from "../../stream/schema/streamProducerDeltaSchema.js"
import { attemptTable } from "../db/attemptTable.js"
import { runActiveStateRepositoryDelete } from "../db/runActiveStateRepositoryDelete.js"
import { runActiveStateRepositoryUpsert } from "../db/runActiveStateRepositoryUpsert.js"
import { runFinalizedDetailRepositoryUpsert } from "../db/runFinalizedDetailRepositoryUpsert.js"
import { runHistoryEntryPayloadCreate } from "../db/runHistoryEntryPayloadCreate.js"
import { runHistoryToolEntryIdCreate } from "../db/runHistoryToolEntryIdCreate.js"
import { runActiveStateTable } from "../db/runActiveStateTable.js"
import { runTable } from "../db/runTable.js"
import { runErrorCodes } from "../errors/runErrorCodes.js"
import { runResultCreateError } from "../errors/runResultCreateError.js"
import { runFinalizedDetailCreate } from "./runFinalizedDetailCreate.js"
import { runFinalizedToolProjectionPersist } from "./runFinalizedToolProjectionPersist.js"
import { runTransition } from "./runTransition.js"
import { runToolDetailIdCreate } from "./runToolDetailIdCreate.js"

type RunProviderOutputScheduler = {
  clearTimeout: (handle: unknown) => void
  setTimeout: (handler: () => void, timeoutMs: number) => unknown
}

type RunProviderOutputCreateOptions = {
  database: DatabaseExecutor
  journalEventsAppendPersist?: typeof journalEventsAppendPersist
  journalPostCommitPublish: ReturnType<typeof journalPostCommitPublishCreate>
  journalRunDeltasDelete?: typeof journalRunDeltasDelete
  runFinalizedDetailUpsert?: typeof runFinalizedDetailRepositoryUpsert
  messageAppend?: typeof messageAppend
  requestId: string
  runId: string
  scheduler: RunProviderOutputScheduler
  sessionId: string
  userId: string
  runTransition?: typeof runTransition
}

type RunProviderOutputFinalizeInput = {
  assistantText?: string
  failure?: { code: string; message: string }
  messageId?: string | null
  reason?: string
  status: "aborted" | "failed" | "succeeded"
  usage?: CompactionTokenUsage
}

type RunProviderOutputFinalizeResult = {
  attempt: typeof attemptTable.$inferSelect
  run: typeof runTable.$inferSelect
}

type RunProviderOutputStartResult = RunProviderOutputFinalizeResult & {
  changed: boolean
}

type RunProviderOutputToolUpdate = {
  detail: string | undefined
  key: string | undefined
  outcome: "error" | "success" | undefined
  phase: "args" | "other" | "output" | "result"
  toolCallId: string | undefined
  toolName: string | undefined
  truncated: boolean
  workingDirectory: string | undefined
}

type RunProviderOutputToolEmissionState = {
  cumulative: boolean
  lastEmittedDetailLength: number | undefined
  previousDetail: string | undefined
  skippedSinceEmit: number
}

const runProviderOutputToolDeltaMaximumBytes = 16 * 1024
const runProviderOutputToolDetailGrowthMinimum = 256
const runProviderOutputToolEmissionSkipLimit = 10
const runProviderOutputToolDeltaTextEncoder = new TextEncoder()
const runProviderOutputToolTruncationMarker = "[Earlier output truncated]"

function runProviderOutputRecipientResolve(userId: string) {
  return async (transaction: DatabaseTransaction, resource: { resourceId: string; resourceType: string }) => {
    const op = "runProviderOutputRecipientResolve"
    if (resource.resourceType !== "run")
      return runResultCreateError(op, "The run journal resource is invalid.", runErrorCodes.journalResourceInvalid)
    try {
      const [run] = await transaction
        .select({ userId: runTable.userId })
        .from(runTable)
        .where(and(eq(runTable.id, resource.resourceId), eq(runTable.userId, userId)))
        .limit(1)
      if (run === undefined)
        return runResultCreateError(op, "The run journal resource could not be authorized.", runErrorCodes.notFound)
      return createResult([run.userId])
    } catch (_error) {
      return runResultCreateError(
        op,
        "The run journal recipient could not be resolved.",
        runErrorCodes.journalRecipientFailed,
      )
    }
  }
}

function runProviderOutputMessageIdResolve(input: Record<string, unknown>): string | null {
  return typeof input.messageId === "string" ? input.messageId : null
}

function runProviderOutputToolMessageIdResolve(toolCallId: string | undefined, phase: string): string | null {
  if (toolCallId === undefined || toolCallId.length === 0) return null
  const digest = createHash("sha256").update(toolCallId, "utf8").digest("hex").slice(0, 24)
  return `tool-${digest}-${phase}`
}

function runProviderOutputToolRecord(input: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(input)
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return undefined
    return parsed as Record<string, unknown>
  } catch {
    return undefined
  }
}

function runProviderOutputToolPayloadBound(input: unknown): { content: string; truncated: boolean } {
  return typeof input === "string" ? executionToolPayloadBound(input, "serialized") : executionToolPayloadBound(input)
}

function runProviderOutputToolCallIdResolve(record: Record<string, unknown>): string | undefined {
  return typeof record.toolCallId === "string" ? record.toolCallId : undefined
}

function runProviderOutputToolPayloadRecordBound(
  record: Record<string, unknown>,
): { detail: string; phase: "output" | "result"; record: Record<string, unknown>; truncated: boolean } | undefined {
  const prefix = typeof record.eventType === "string" ? { eventType: record.eventType } : {}
  const toolCallId = runProviderOutputToolCallIdResolve(record)
  if (Object.hasOwn(record, "output")) {
    const output = runProviderOutputToolPayloadBound(record.output)
    return {
      detail: output.content,
      phase: "output",
      record: {
        ...prefix,
        output: output.content,
        ...(toolCallId === undefined ? {} : { toolCallId }),
        truncated: record.truncated === true || output.truncated,
      },
      truncated: record.truncated === true || output.truncated,
    }
  }
  if (Object.hasOwn(record, "result") || Object.hasOwn(record, "outcome")) {
    const result = runProviderOutputToolPayloadBound(record.result)
    const workingDirectory = typeof record.workingDirectory === "string" ? record.workingDirectory : undefined
    return {
      detail: result.content,
      phase: "result",
      record: {
        ...prefix,
        ...(typeof record.outcome === "string" ? { outcome: record.outcome } : {}),
        result: result.content,
        ...(toolCallId === undefined ? {} : { toolCallId }),
        truncated: record.truncated === true || result.truncated,
        ...(workingDirectory === undefined ? {} : { workingDirectory }),
      },
      truncated: record.truncated === true || result.truncated,
    }
  }
  return undefined
}

function runProviderOutputToolDeltaBound(event: StreamProducerDelta): StreamProducerDelta {
  if (event.deltaKind !== "tool" || typeof event.delta !== "string") return event

  const record = runProviderOutputToolRecord(event.delta)
  if (record === undefined) {
    return { ...event, delta: executionToolPayloadBound(event.delta, "text").content }
  }

  const isArgumentsDelta = event.messageId?.endsWith("-args") === true
  const nestedRecord = record.payload
  const payload =
    !isArgumentsDelta && (record.eventType === "tool_output" || record.eventType === "tool_result")
      ? nestedRecord !== null && typeof nestedRecord === "object" && !Array.isArray(nestedRecord)
        ? (nestedRecord as Record<string, unknown>)
        : undefined
      : isArgumentsDelta
        ? undefined
        : record
  const boundedPayload = payload === undefined ? undefined : runProviderOutputToolPayloadRecordBound(payload)
  const boundedRecord =
    boundedPayload === undefined
      ? undefined
      : record.eventType === "tool_output" || record.eventType === "tool_result"
        ? { eventType: record.eventType, payload: boundedPayload.record }
        : boundedPayload.record
  if (boundedRecord !== undefined) return { ...event, delta: JSON.stringify(boundedRecord) }

  if (runProviderOutputToolDeltaTextEncoder.encode(event.delta).byteLength <= runProviderOutputToolDeltaMaximumBytes)
    return event
  return { ...event, delta: executionToolPayloadBound(record).content }
}

function runProviderOutputToolUpdateResolve(event: StreamProducerDelta): RunProviderOutputToolUpdate {
  if (event.deltaKind !== "tool")
    return {
      detail: undefined,
      key: undefined,
      outcome: undefined,
      phase: "other",
      toolCallId: undefined,
      toolName: undefined,
      truncated: false,
      workingDirectory: undefined,
    }
  const record = runProviderOutputToolRecord(event.delta)
  if (record === undefined) {
    return {
      detail: event.delta,
      key: event.messageId === null ? undefined : `${event.messageId}\u0000args`,
      outcome: undefined,
      phase: "args",
      toolCallId: undefined,
      toolName: undefined,
      truncated: event.delta.includes(runProviderOutputToolTruncationMarker),
      workingDirectory: undefined,
    }
  }
  if (event.messageId?.endsWith("-args") === true) {
    return {
      detail: event.delta,
      key: event.messageId,
      outcome: undefined,
      phase: "args",
      toolCallId: runProviderOutputToolCallIdResolve(record),
      toolName: typeof record.toolName === "string" ? record.toolName : undefined,
      truncated: event.delta.includes(runProviderOutputToolTruncationMarker),
      workingDirectory: undefined,
    }
  }
  const nestedRecord = record.payload
  const payload =
    (record.eventType === "tool_output" || record.eventType === "tool_result") &&
    nestedRecord !== null &&
    typeof nestedRecord === "object" &&
    !Array.isArray(nestedRecord)
      ? (nestedRecord as Record<string, unknown>)
      : record
  if (payload !== undefined && (typeof payload.toolName === "string" || payload.eventType === "tool_start"))
    return {
      detail: undefined,
      key: undefined,
      outcome: undefined,
      phase: "other",
      toolCallId: runProviderOutputToolCallIdResolve(payload),
      toolName: typeof payload.toolName === "string" ? payload.toolName : undefined,
      truncated: false,
      workingDirectory: undefined,
    }
  const bounded = runProviderOutputToolPayloadRecordBound(payload)
  if (bounded === undefined) {
    return {
      detail: event.delta,
      key: event.messageId === null ? undefined : `${event.messageId}\u0000args`,
      outcome: undefined,
      phase: "args",
      toolCallId: runProviderOutputToolCallIdResolve(payload),
      toolName: typeof payload.toolName === "string" ? payload.toolName : undefined,
      truncated: event.delta.includes(runProviderOutputToolTruncationMarker),
      workingDirectory: undefined,
    }
  }
  const toolCallId = runProviderOutputToolCallIdResolve(payload)
  const key =
    toolCallId === undefined && event.messageId === null
      ? undefined
      : `${event.messageId ?? ""}\u0000${toolCallId ?? ""}\u0000${bounded.phase}`
  return {
    detail: bounded.detail,
    key,
    outcome: typeof bounded.record.outcome === "string" ? (bounded.record.outcome as "error" | "success") : undefined,
    phase: bounded.phase,
    toolCallId,
    toolName: typeof bounded.record.toolName === "string" ? bounded.record.toolName : undefined,
    truncated: bounded.truncated,
    workingDirectory: typeof bounded.record.workingDirectory === "string" ? bounded.record.workingDirectory : undefined,
  }
}

function runProviderOutputToolCumulativeResolve(previous: string, next: string): boolean {
  if (next.startsWith(previous)) return true
  if (next.length < previous.length || previous.length < runProviderOutputToolDetailGrowthMinimum) return false
  let commonPrefixLength = 0
  while (commonPrefixLength < previous.length && commonPrefixLength < next.length) {
    if (previous[commonPrefixLength] !== next[commonPrefixLength]) break
    commonPrefixLength += 1
  }
  return commonPrefixLength >= runProviderOutputToolDetailGrowthMinimum && commonPrefixLength / previous.length >= 0.8
}

function runProviderOutputToolUpdateShouldEmit(
  update: RunProviderOutputToolUpdate,
  states: Map<string, RunProviderOutputToolEmissionState>,
): boolean {
  if ((update.phase !== "output" && update.phase !== "args") || update.key === undefined || update.detail === undefined)
    return true
  const previous = states.get(update.key)
  if (previous === undefined) {
    states.set(update.key, {
      cumulative: update.truncated,
      lastEmittedDetailLength: update.detail.length,
      previousDetail: update.detail,
      skippedSinceEmit: 0,
    })
    return true
  }

  const cumulative =
    previous.cumulative ||
    update.truncated ||
    runProviderOutputToolCumulativeResolve(previous.previousDetail ?? "", update.detail)
  if (!cumulative) {
    states.set(update.key, { ...previous, cumulative: false, previousDetail: update.detail })
    return true
  }
  const detailChanged = previous.previousDetail !== update.detail
  const grewMeaningfully =
    previous.lastEmittedDetailLength === undefined ||
    Math.abs(update.detail.length - previous.lastEmittedDetailLength) >= runProviderOutputToolDetailGrowthMinimum
  if (!detailChanged) {
    states.set(update.key, { ...previous, cumulative, previousDetail: update.detail })
    return false
  }
  if (grewMeaningfully || previous.skippedSinceEmit + 1 >= runProviderOutputToolEmissionSkipLimit) {
    states.set(update.key, {
      lastEmittedDetailLength: update.detail.length,
      cumulative,
      previousDetail: update.detail,
      skippedSinceEmit: 0,
    })
    return true
  }
  states.set(update.key, {
    ...previous,
    cumulative,
    previousDetail: update.detail,
    skippedSinceEmit: previous.skippedSinceEmit + 1,
  })
  return false
}

function runProviderOutputToolNameBound(toolName: string | undefined): string | undefined {
  if (toolName === undefined) return undefined
  const bounded = toolName.trim().slice(0, 256)
  return bounded.length === 0 ? undefined : bounded
}

function runProviderOutputToolBooleanRead(record: Record<string, unknown>, key: string): boolean {
  return record[key] === true
}

function runProviderOutputToolOutcomeRead(value: unknown): "error" | "success" | undefined {
  return value === "error" || value === "success" ? value : undefined
}

async function runProviderOutputToolProjectionPersist(
  transaction: DatabaseTransaction,
  userId: string,
  sessionId: string,
  runId: string,
  update: RunProviderOutputToolUpdate,
  sequence: number,
): Promise<Result<void>> {
  const toolCallId = update.toolCallId
  if (toolCallId === undefined || toolCallId.trim().length === 0) return createResult(undefined)

  const [existing] = await transaction
    .select()
    .from(sessionHistoryEntryTable)
    .where(
      and(
        eq(sessionHistoryEntryTable.userId, userId),
        eq(sessionHistoryEntryTable.sessionId, sessionId),
        eq(sessionHistoryEntryTable.sourceType, "tool"),
        eq(sessionHistoryEntryTable.sourceId, runId),
        eq(sessionHistoryEntryTable.sourceDetailId, toolCallId),
      ),
    )
    .limit(1)
  const previous =
    existing?.payload !== null && typeof existing?.payload === "object" && !Array.isArray(existing.payload)
      ? (existing.payload as Record<string, unknown>)
      : {}
  const entryId = existing?.id ?? runHistoryToolEntryIdCreate(runId, toolCallId)
  const detailId = runToolDetailIdCreate(runId, toolCallId)
  const toolName = runProviderOutputToolNameBound(
    update.toolName ?? (typeof previous.toolName === "string" ? previous.toolName : undefined),
  )
  const outcome = update.outcome ?? runProviderOutputToolOutcomeRead(previous.outcome)
  const outputAvailable = runProviderOutputToolBooleanRead(previous, "outputAvailable") || update.phase === "output"
  const outputTruncated =
    runProviderOutputToolBooleanRead(previous, "outputTruncated") || (update.phase === "output" && update.truncated)
  const resultAvailable = runProviderOutputToolBooleanRead(previous, "resultAvailable") || update.phase === "result"
  const resultTruncated =
    runProviderOutputToolBooleanRead(previous, "resultTruncated") || (update.phase === "result" && update.truncated)
  const workingDirectory =
    update.workingDirectory?.slice(0, 4_096) ??
    (typeof previous.workingDirectory === "string" ? previous.workingDirectory.slice(0, 4_096) : undefined)
  const firstSequence =
    typeof previous.sequence === "number" && Number.isSafeInteger(previous.sequence) ? previous.sequence : sequence
  const status = outcome ?? "running"
  const payload = {
    detailId,
    id: entryId,
    kind: "tool" as const,
    ...(outcome === undefined ? {} : { outcome }),
    ...(outputAvailable ? { outputAvailable, outputTruncated } : {}),
    ...(resultAvailable ? { resultAvailable, resultTruncated } : {}),
    runId,
    sequence: firstSequence,
    summary: `${toolName ?? "Tool"} · ${status}`,
    toolCallId,
    ...(toolName === undefined ? {} : { toolName }),
    ...(workingDirectory === undefined ? {} : { workingDirectory }),
    ...(typeof previous.delegationId === "string" &&
    typeof previous.parentSessionId === "string" &&
    typeof previous.childRunId === "string" &&
    typeof previous.delegationStatus === "string"
      ? {
          childRunId: previous.childRunId,
          delegationId: previous.delegationId,
          delegationStatus: previous.delegationStatus,
          parentSessionId: previous.parentSessionId,
        }
      : {}),
  }
  const saved = await sessionHistoryEntryRepositoryUpsert(transaction, userId, sessionId, {
    id: entryId,
    kind: "tool",
    payload,
    sourceDetailId: toolCallId,
    sourceId: runId,
    sourceType: "tool",
  })
  if (!saved.success) return saved
  return createResult(undefined)
}

function runProviderOutputExecutionEventDeltaResolve(
  event: ExecutionStreamEvent,
  runId: string,
  sessionId: string,
): Result<StreamProducerDelta | null> {
  if (event.eventType === "text_delta")
    return createResult({ delta: event.payload.delta, deltaKind: "text", messageId: null, runId, sessionId })
  if (event.eventType === "thinking_status")
    return createResult({ delta: event.payload.status, deltaKind: "thinking", messageId: null, runId, sessionId })
  if (event.eventType === "tool_start")
    return createResult({
      delta: JSON.stringify(event.payload),
      deltaKind: "tool",
      messageId: runProviderOutputToolMessageIdResolve(event.payload.toolCallId, "start"),
      runId,
      sessionId,
    })
  if (event.eventType === "tool_output")
    return createResult({
      delta: JSON.stringify(event.payload),
      deltaKind: "tool",
      messageId: runProviderOutputToolMessageIdResolve(event.payload.toolCallId, "output"),
      runId,
      sessionId,
    })
  if (event.eventType === "tool_result")
    return createResult({
      delta: JSON.stringify(event.payload),
      deltaKind: "tool",
      messageId: runProviderOutputToolMessageIdResolve(event.payload.toolCallId, "result"),
      runId,
      sessionId,
    })
  return createResult(null)
}

function runProviderOutputDeltaResolve(
  input: unknown,
  runId: string,
  sessionId: string,
): Result<StreamProducerDelta | null> {
  if (input === null || typeof input !== "object") return createResult(null)
  const candidate = input as Record<string, unknown>

  if (typeof candidate.deltaKind === "string" && typeof candidate.runId === "string") {
    return createResult(input as StreamProducerDelta)
  }

  const providerEvent = providerExecutionEventFromStreamChunk(input)
  if (providerEvent.success && providerEvent.data !== null) {
    const normalized = executionStreamEventNormalize(providerEvent.data)
    if (!normalized.success) return createResult(null)
    return runProviderOutputExecutionEventDeltaResolve(normalized.data, runId, sessionId)
  }

  const type = candidate.type
  if (type === "TOOL_CALL_ARGS" && typeof candidate.delta === "string")
    return createResult({
      delta: candidate.delta,
      deltaKind: "tool",
      messageId: runProviderOutputToolMessageIdResolve(
        typeof candidate.toolCallId === "string" ? candidate.toolCallId : undefined,
        "args",
      ),
      runId,
      sessionId,
    })
  const eventType = candidate.eventType
  const eventPayload = candidate.payload
  if (typeof eventType === "string" && typeof eventPayload === "object" && eventPayload !== null) {
    const parsed = v.safeParse(executionStreamEventSchema, { eventType, payload: eventPayload })
    if (!parsed.success) return createResult(null)
    return runProviderOutputExecutionEventDeltaResolve(parsed.output, runId, sessionId)
  }
  const delta = candidate.delta
  if (typeof delta !== "string") return createResult(null)

  const deltaKind =
    type === "TEXT_MESSAGE_CONTENT"
      ? "text"
      : type === "TOOL_CALL_ARGS"
        ? "tool"
        : type === "THINKING_TEXT_MESSAGE_CONTENT" ||
            type === "REASONING_MESSAGE_CONTENT" ||
            type === "REASONING_MESSAGE_CHUNK"
          ? "thinking"
          : null
  if (deltaKind === null) return createResult(null)

  return createResult({
    delta,
    deltaKind,
    messageId: runProviderOutputMessageIdResolve(candidate),
    runId,
    sessionId,
  })
}

function runProviderOutputTerminalEventCreate(
  input: RunProviderOutputFinalizeInput,
  sessionRevision: number,
  runId: string,
  sessionId: string,
) {
  if (input.status === "succeeded") {
    return {
      eventType: "run-completed" as const,
      payload: {
        messageId: input.messageId ?? null,
        runId,
        sessionId,
        sessionRevision,
      },
    }
  }
  if (input.status === "failed") {
    return {
      eventType: "run-failed" as const,
      payload: {
        failure: input.failure ?? null,
        runId,
        sessionId,
        sessionRevision,
      },
    }
  }
  return {
    eventType: "run-cancelled" as const,
    payload: {
      ...(input.reason === undefined ? {} : { reason: input.reason }),
      runId,
      sessionId,
      sessionRevision,
    },
  }
}

function runProviderOutputTransitionInputCreate(input: RunProviderOutputFinalizeInput) {
  if (input.status === "succeeded") return { status: "succeeded" as const }
  if (input.status === "failed") {
    return {
      failure: input.failure ?? { code: "provider_failed", message: "The provider failed." },
      status: "failed" as const,
    }
  }
  return { status: "aborted" as const }
}

async function runProviderOutputSessionRevisionLoad(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  assistantText: string | undefined,
): Promise<Result<number>> {
  const op = "runProviderOutput"
  try {
    const [session] = await database
      .select({ revision: sessionTable.revision })
      .from(sessionTable)
      .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
      .limit(1)
    if (session === undefined)
      return runResultCreateError(op, "The session could not be found.", runErrorCodes.sessionNotFound)
    return createResult(session.revision + (assistantText === undefined ? 0 : 1))
  } catch (_error) {
    return runResultCreateError(op, "The session revision could not be loaded.", runErrorCodes.sessionUpdateFailed)
  }
}

async function runProviderOutputRunStartProjectionPersist(
  transaction: DatabaseTransaction,
  userId: string,
  sessionId: string,
  runId: string,
): Promise<Result<void>> {
  const historyEntry = await sessionHistoryEntryRepositoryUpsert(transaction, userId, sessionId, {
    id: runId,
    kind: "run",
    payload: runHistoryEntryPayloadCreate({ id: runId, status: "running" }),
    sourceId: runId,
    sourceType: "run",
  })
  if (!historyEntry.success) return historyEntry

  const activeState = await runActiveStateRepositoryUpsert(transaction, userId, sessionId, runId, {
    status: "running",
  })
  if (!activeState.success) return activeState
  return createResult(undefined)
}

export function runProviderOutputCreate(options: RunProviderOutputCreateOptions) {
  const resource = { resourceId: options.runId, resourceType: "run" as const }
  const resolveRecipients = runProviderOutputRecipientResolve(options.userId)
  const journalWriter = journalWriteCreate({
    database: options.database,
    ...(options.journalEventsAppendPersist === undefined ? {} : { appendPersist: options.journalEventsAppendPersist }),
    postCommitPublish: options.journalPostCommitPublish,
    resolveRecipients,
  })
  const appendMessage = options.messageAppend ?? messageAppend
  const transitionRun = options.runTransition ?? runTransition
  const persistFinalizedDetail = options.runFinalizedDetailUpsert ?? runFinalizedDetailRepositoryUpsert
  let flushes = Promise.resolve<Result<void>>(createResult(undefined))
  const toolEmissionStates = new Map<string, RunProviderOutputToolEmissionState>()

  const deltaPersist = async (event: StreamProducerDelta): Promise<Result<void>> => {
    const persisted = await journalWriter.run({
      resources: [resource],
      write: async (transaction, journal) => {
        const appended = await journal.append({ eventType: "delta", payload: event, resource })
        if (!appended.success) return appended

        const journalEvent = appended.data.events.find((candidate) => candidate.userId === options.userId)
        if (journalEvent === undefined)
          return runResultCreateError(
            "runProviderOutput",
            "The persisted provider delta could not be associated with its run.",
            runErrorCodes.providerOutputPersistFailed,
          )
        const [activeState] = await transaction
          .select()
          .from(runActiveStateTable)
          .where(
            and(
              eq(runActiveStateTable.runId, options.runId),
              eq(runActiveStateTable.sessionId, options.sessionId),
              eq(runActiveStateTable.userId, options.userId),
            ),
          )
          .limit(1)
        if (activeState === undefined)
          return runResultCreateError(
            "runProviderOutput",
            "The active run state could not be found.",
            runErrorCodes.providerOutputPersistFailed,
          )
        const partialText =
          event.deltaKind === "text"
            ? `${activeState.partialText}${event.delta}`.slice(0, 16_384)
            : activeState.partialText
        const updatedActiveState = await runActiveStateRepositoryUpsert(
          transaction,
          options.userId,
          options.sessionId,
          options.runId,
          { lastSequence: journalEvent.sequence, partialText, status: "running" },
        )
        if (!updatedActiveState.success) return updatedActiveState

        const toolUpdate = runProviderOutputToolUpdateResolve(event)
        if (toolUpdate.toolCallId !== undefined) {
          const projectedTool = await runProviderOutputToolProjectionPersist(
            transaction,
            options.userId,
            options.sessionId,
            options.runId,
            toolUpdate,
            journalEvent.sequence,
          )
          if (!projectedTool.success) return projectedTool
        }
        return createResult(undefined)
      },
    })
    if (!persisted.success) return persisted
    return createResult(undefined)
  }

  const coalescer = streamProducerCoalescerCreate({
    onFlush: (event) => {
      flushes = flushes.then(async (previous) => {
        if (!previous.success) return previous
        try {
          return await deltaPersist(event)
        } catch (_error) {
          return runResultCreateError(
            "runProviderOutput",
            "The provider delta could not be persisted.",
            runErrorCodes.providerOutputPersistFailed,
          )
        }
      })
    },
    scheduler: options.scheduler,
  })

  const flushesAwait = async (): Promise<Result<void>> => flushes

  const append = async (input: unknown): Promise<Result<void>> => {
    const event = runProviderOutputDeltaResolve(input, options.runId, options.sessionId)
    if (!event.success) return event
    if (event.data === null) return createResult(undefined)
    if (event.data.runId !== options.runId || event.data.sessionId !== options.sessionId) {
      return runResultCreateError(
        "runProviderOutput",
        "The provider delta belongs to another run.",
        runErrorCodes.stateInconsistent,
      )
    }
    const boundedEvent = runProviderOutputToolDeltaBound(event.data)
    const toolUpdate = runProviderOutputToolUpdateResolve(boundedEvent)
    if (!runProviderOutputToolUpdateShouldEmit(toolUpdate, toolEmissionStates)) return flushesAwait()
    const appended = coalescer.append(boundedEvent)
    if (!appended.success) return appended
    return flushesAwait()
  }

  const flush = async (): Promise<Result<void>> => {
    const flushed = coalescer.flushAll()
    if (!flushed.success) return flushed
    return flushesAwait()
  }

  const start = async (): Promise<Result<RunProviderOutputStartResult>> => {
    let transition: RunProviderOutputStartResult | undefined
    const started = await journalWriter.run<RunProviderOutputStartResult>({
      mutate: async (transaction) => {
        const transitioned = await transitionRun(transaction, options.userId, options.sessionId, options.runId, {
          status: "running",
        })
        if (!transitioned.success) return transitioned
        transition = {
          attempt: transitioned.data.attempt,
          changed: transitioned.data.changed,
          run: transitioned.data.run,
        }
        if (transition.changed) {
          const projected = await runProviderOutputRunStartProjectionPersist(
            transaction,
            options.userId,
            options.sessionId,
            options.runId,
          )
          if (!projected.success) return projected
        }
        return createResult(transition)
      },
      resources: [resource],
      write: async (_transaction, journal) => {
        if (transition === undefined)
          return runResultCreateError(
            "runProviderOutput",
            "The run start mutation result is missing.",
            runErrorCodes.mutationMissing,
          )
        if (!transition.changed) return createResult(undefined)
        const appended = await journal.append({
          eventType: "run-started",
          payload: { runId: options.runId, sessionId: options.sessionId },
          resource,
        })
        if (!appended.success) return appended
        return createResult(undefined)
      },
    })
    if (!started.success) return started
    if (transition === undefined)
      return runResultCreateError(
        "runProviderOutput",
        "The run start mutation result is missing.",
        runErrorCodes.mutationMissing,
      )
    return createResult(transition)
  }

  const finalize = async (input: RunProviderOutputFinalizeInput): Promise<Result<RunProviderOutputFinalizeResult>> => {
    const flushed = await flush()
    if (!flushed.success) return flushed
    const sessionRevision = await runProviderOutputSessionRevisionLoad(
      options.database,
      options.userId,
      options.sessionId,
      input.assistantText,
    )
    if (!sessionRevision.success) return sessionRevision
    const terminalEvent = runProviderOutputTerminalEventCreate(
      input,
      sessionRevision.data,
      options.runId,
      options.sessionId,
    )
    const finalizer = journalRunFinalize({
      database: options.database,
      ...(options.journalEventsAppendPersist === undefined
        ? {}
        : { appendPersist: options.journalEventsAppendPersist }),
      ...(options.journalRunDeltasDelete === undefined ? {} : { runDeltasDelete: options.journalRunDeltasDelete }),
      postCommitPublish: options.journalPostCommitPublish,
      resolveRecipients,
    })
    let terminalChangePosition: number | undefined
    const finalized = await finalizer.finalize(
      {
        runId: options.runId,
        terminalEvent: () => ({
          ...terminalEvent,
          payload: { ...terminalEvent.payload, changePosition: terminalChangePosition },
        }),
      },
      async (transaction) => {
        if (input.status === "succeeded" && input.assistantText !== undefined) {
          const message = await appendMessage(transaction, options.userId, options.sessionId, {
            clientRequestId: `${options.requestId}:assistant`,
            content: input.assistantText,
            ...(input.usage === undefined ? {} : { metadata: compactionTokenUsageMetadataCreate(input.usage) }),
            role: "assistant",
          })
          if (!message.success) return message
        }
        const transitioned = await transitionRun(
          transaction,
          options.userId,
          options.sessionId,
          options.runId,
          runProviderOutputTransitionInputCreate(input),
        )
        if (!transitioned.success) return transitioned
        const historyEntry = await sessionHistoryEntryRepositoryUpsert(transaction, options.userId, options.sessionId, {
          id: transitioned.data.run.id,
          kind: "run",
          payload: runHistoryEntryPayloadCreate({
            id: transitioned.data.run.id,
            status: input.status === "succeeded" ? "succeeded" : input.status === "failed" ? "failed" : "aborted",
            terminalKind:
              input.status === "succeeded" ? "completed" : input.status === "failed" ? "failed" : "cancelled",
          }),
          sourceId: transitioned.data.run.id,
          sourceType: "run",
        })
        if (!historyEntry.success) return historyEntry
        terminalChangePosition = historyEntry.data.entry.changePosition
        const detail = await runFinalizedDetailCreate(
          transaction,
          options.userId,
          options.sessionId,
          options.runId,
          transitioned.data.run,
          terminalEvent,
          input.status === "succeeded" ? input.assistantText : undefined,
        )
        if (!detail.success) return detail
        const projectedTools = await runFinalizedToolProjectionPersist(
          transaction,
          options.userId,
          options.sessionId,
          options.runId,
          detail.data.tools,
        )
        if (!projectedTools.success) return projectedTools
        const persistedDetail = await persistFinalizedDetail(
          transaction,
          options.userId,
          options.sessionId,
          options.runId,
          {
            tools: detail.data.tools,
            transcript: detail.data.transcript,
          },
        )
        if (!persistedDetail.success) return persistedDetail
        const clearedActiveState = await runActiveStateRepositoryDelete(
          transaction,
          options.userId,
          options.sessionId,
          options.runId,
        )
        if (!clearedActiveState.success) return clearedActiveState
        return createResult({ run: transitioned.data.run, attempt: transitioned.data.attempt })
      },
    )
    return finalized
  }

  return { append, finalize, flush, pendingCount: coalescer.pendingCount, start }
}

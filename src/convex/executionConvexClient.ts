import type { Result } from "@adaptive-ds/result"
import { ConvexHttpClient } from "convex/browser"
import { makeFunctionReference } from "convex/server"
import type { attemptTable } from "../run/db/attemptTable.js"
import type { runDelegationTable } from "../run/db/runDelegationTable.js"
import type { runTable } from "../run/db/runTable.js"
import type { RunChildCreateInput } from "../run/schema/runChildCreateInputSchema.js"
import type { RunCreateInput } from "../run/schema/runCreateInputSchema.js"
import type { RunDelegationResult } from "../run/schema/runDelegationResultSchema.js"
import type { RunChildAdmission } from "../run/schema/runChildAdmissionSchema.js"
import type { RunRetryAdmission } from "../run/schema/runRetryAdmissionSchema.js"
import type { RunTransitionInput } from "../run/schema/runTransitionInputSchema.js"
import type { streamCheckpointTable } from "../stream/db/streamCheckpointTable.js"
import type { streamEventTable } from "../stream/db/streamEventTable.js"
import type { messageTable } from "../message/db/messageTable.js"

type ConvexResult<T> = Result<T>
type RunRecord = typeof runTable.$inferSelect
type AttemptRecord = typeof attemptTable.$inferSelect
type DelegationRecord = typeof runDelegationTable.$inferSelect
type EventRecord = typeof streamEventTable.$inferSelect
type CheckpointRecord = typeof streamCheckpointTable.$inferSelect

export type ExecutionConvexClient = {
  messageAppend: (
    userId: string,
    sessionId: string,
    input: { clientRequestId: string; content: string; role: "assistant" | "user" },
  ) => Promise<Result<{ created: boolean; message: typeof messageTable.$inferSelect }>>
  messageCopyFinalizedPrefix: (
    userId: string,
    sourceSessionId: string,
    targetSessionId: string,
    messageId: string,
  ) => Promise<Result<Array<typeof messageTable.$inferSelect>>>
  messageListFinalized: (
    userId: string,
    sessionId: string,
    options: { cursor?: string; limit: number },
  ) => Promise<Result<{ messages: Array<typeof messageTable.$inferSelect>; nextCursor: string | null }>>
  messageLoadDurableHistory: (
    userId: string,
    sessionId: string,
  ) => Promise<Result<Array<typeof messageTable.$inferSelect>>>
  messagePrepare: (
    userId: string,
    sessionId: string,
    input: { clientRequestId: string; content: string },
  ) => Promise<
    Result<{ history: Array<typeof messageTable.$inferSelect>; userMessage: typeof messageTable.$inferSelect }>
  >
  runCancel: (
    userId: string,
    sessionId: string,
    runId: string,
    input?: { kind?: "requested" },
  ) => Promise<Result<{ cancelledRunIds: string[]; changed: boolean; descendantsCancelled: number; run: RunRecord }>>
  runChildCreate: (
    userId: string,
    sessionId: string,
    input: RunChildCreateInput,
  ) => Promise<
    Result<{
      admission: RunChildAdmission | null
      attempt: AttemptRecord
      created: boolean
      delegation: DelegationRecord
      run: RunRecord
    }>
  >
  runChildStreamResolve: (userId: string, sessionId: string, streamId: string) => Promise<Result<boolean>>
  runCreate: (
    userId: string,
    sessionId: string,
    input: RunCreateInput,
  ) => Promise<Result<{ created: boolean; run: RunRecord; attempt: AttemptRecord }>>
  runDelegationFinalize: (
    userId: string,
    sessionId: string,
    delegationId: string,
    result: RunDelegationResult,
  ) => Promise<Result<{ attempt: AttemptRecord; changed: boolean; delegation: DelegationRecord; run: RunRecord }>>
  runLoad: (
    userId: string,
    sessionId: string,
    clientRunId: string,
  ) => Promise<Result<{ attempt: AttemptRecord; attempts: AttemptRecord[]; run: RunRecord }>>
  runRetryAttemptCreate: (
    userId: string,
    sessionId: string,
    runId: string,
    options?: { now?: () => Date },
  ) => Promise<
    Result<{ admission: RunRetryAdmission | null; attempt: AttemptRecord; created: boolean; run: RunRecord }>
  >
  runTransition: (
    userId: string,
    sessionId: string,
    runId: string,
    input: RunTransitionInput,
  ) => Promise<Result<{ changed: boolean; run: RunRecord; attempt: AttemptRecord }>>
  streamAppend: (
    userId: string,
    sessionId: string,
    input: { eventType: string; idempotencyKey: string; payload: unknown; sequence: number; streamId: string },
  ) => Promise<Result<{ created: boolean; event: EventRecord }>>
  streamCheckpointAdvance: (
    userId: string,
    sessionId: string,
    streamId: string,
    lastSequence: number,
  ) => Promise<Result<{ advanced: boolean; checkpoint: CheckpointRecord }>>
  streamCheckpointLoadOrCreate: (
    userId: string,
    sessionId: string,
    streamId: string,
  ) => Promise<Result<{ created: boolean; checkpoint: CheckpointRecord }>>
  streamListAfter: (
    userId: string,
    sessionId: string,
    streamId: string,
    options: { afterSequence: number; limit: number },
  ) => Promise<Result<EventRecord[]>>
  streamReplayAppend: (
    userId: string,
    sessionId: string,
    input: { eventType: string; idempotencyKey: string; payload: unknown; sequence: number; streamId: string },
    inactivityTimeoutMs: number,
  ) => Promise<Result<{ checkpoint: CheckpointRecord; created: boolean; event: EventRecord }>>
  streamReplay: (
    userId: string,
    sessionId: string,
    streamId: string,
    input: { afterSequence?: number; inactivityTimeoutMs: number; limit?: number },
  ) => Promise<Result<{ checkpoint: CheckpointRecord; events: EventRecord[]; stale: boolean }>>
  streamReplayStart: (
    userId: string,
    sessionId: string,
    streamId: string,
  ) => Promise<Result<{ created: boolean; checkpoint: CheckpointRecord }>>
  streamEventLoad: (
    userId: string,
    sessionId: string,
    streamId: string,
    eventId: string,
  ) => Promise<Result<EventRecord | undefined>>
  streamLatestEvent: (
    userId: string,
    sessionId: string,
    streamId: string,
    lastSequence: number,
  ) => Promise<Result<{ id: string } | undefined>>
}

const references = {
  messageAppend: makeFunctionReference<"mutation", any, ConvexResult<unknown>>("messages:messageAppendInternal"),
  messageCopyFinalizedPrefix: makeFunctionReference<"mutation", any, ConvexResult<unknown>>(
    "messages:messageCopyFinalizedPrefixInternal",
  ),
  messageListFinalized: makeFunctionReference<"query", any, ConvexResult<unknown>>(
    "messages:messageListFinalizedInternal",
  ),
  messageLoadDurableHistory: makeFunctionReference<"query", any, ConvexResult<unknown>>(
    "messages:messageLoadDurableHistoryInternal",
  ),
  messagePrepare: makeFunctionReference<"mutation", any, ConvexResult<unknown>>("messages:messagePrepareInternal"),
  runCancel: makeFunctionReference<"mutation", any, ConvexResult<unknown>>("runs:runCancelInternal"),
  runChildCreate: makeFunctionReference<"mutation", any, ConvexResult<unknown>>("runs:runChildCreateInternal"),
  runChildStreamResolve: makeFunctionReference<"query", any, ConvexResult<unknown>>(
    "runs:runChildStreamResolveInternal",
  ),
  runCreate: makeFunctionReference<"mutation", any, ConvexResult<unknown>>("runs:runCreateInternal"),
  runDelegationFinalize: makeFunctionReference<"mutation", any, ConvexResult<unknown>>(
    "runs:runDelegationFinalizeInternal",
  ),
  runLoad: makeFunctionReference<"query", any, ConvexResult<unknown>>("runs:runLoadInternal"),
  runRetryAttemptCreate: makeFunctionReference<"mutation", any, ConvexResult<unknown>>(
    "runs:runRetryAttemptCreateInternal",
  ),
  runTransition: makeFunctionReference<"mutation", any, ConvexResult<unknown>>("runs:runTransitionInternal"),
  streamAppend: makeFunctionReference<"mutation", any, ConvexResult<unknown>>("streams:streamAppendInternal"),
  streamCheckpointAdvance: makeFunctionReference<"mutation", any, ConvexResult<unknown>>(
    "streams:streamCheckpointAdvanceInternal",
  ),
  streamCheckpointLoadOrCreate: makeFunctionReference<"mutation", any, ConvexResult<unknown>>(
    "streams:streamCheckpointLoadOrCreateInternal",
  ),
  streamListAfter: makeFunctionReference<"query", any, ConvexResult<unknown>>("streams:streamListAfterInternal"),
  streamReplay: makeFunctionReference<"mutation", any, ConvexResult<unknown>>("streams:streamReplayInternal"),
  streamReplayAppend: makeFunctionReference<"mutation", any, ConvexResult<unknown>>(
    "streams:streamReplayAppendInternal",
  ),
  streamReplayStart: makeFunctionReference<"mutation", any, ConvexResult<unknown>>("streams:streamReplayStartInternal"),
  streamEventLoad: makeFunctionReference<"query", any, ConvexResult<unknown>>("streams:streamEventLoadInternal"),
  streamLatestEvent: makeFunctionReference<"query", any, ConvexResult<unknown>>("streams:streamLatestEventInternal"),
} as const

export function executionConvexClientCreate(url: string, adminKey: string): Result<ExecutionConvexClient> {
  const op = "executionConvexClientCreate"
  try {
    const client = new ConvexHttpClient(url, { logger: false, skipConvexDeploymentUrlCheck: true })
    const adminClient = client as ConvexHttpClient & { setAdminAuth: (key: string) => void }
    adminClient.setAdminAuth(adminKey)
    return {
      success: true,
      data: executionConvexClientCreateFromClient(client),
    }
  } catch (_error) {
    return { success: false, op, errorMessage: "The Convex execution client could not be created." }
  }
}

function executionConvexClientCreateFromClient(client: ConvexHttpClient): ExecutionConvexClient {
  return {
    messageAppend: (userId, sessionId, input) =>
      executionMutation(client, references.messageAppend, { ...input, sessionId, userId }).then((result) =>
        executionResultMap(result, (value) => ({ ...value, message: messageRecordMap(value.message) })),
      ),
    messageCopyFinalizedPrefix: (userId, sourceSessionId, targetSessionId, messageId) =>
      executionMutation(client, references.messageCopyFinalizedPrefix, {
        messageId,
        sourceSessionId,
        targetSessionId,
        userId,
      }).then((result) => executionResultMap(result, (value) => value.map(messageRecordMap))),
    messageListFinalized: (userId, sessionId, options) =>
      executionQuery(client, references.messageListFinalized, { ...options, sessionId, userId }).then((result) =>
        executionResultMap(result, (value) => ({
          messages: value.messages.map(messageRecordMap),
          nextCursor: value.nextCursor,
        })),
      ),
    messageLoadDurableHistory: (userId, sessionId) =>
      executionQuery(client, references.messageLoadDurableHistory, { sessionId, userId }).then((result) =>
        executionResultMap(result, (value) => value.map(messageRecordMap)),
      ),
    messagePrepare: (userId, sessionId, input) =>
      executionMutation(client, references.messagePrepare, { ...input, sessionId, userId }).then((result) =>
        executionResultMap(result, (value) => ({
          history: value.history.map(messageRecordMap),
          userMessage: messageRecordMap(value.userMessage),
        })),
      ),
    runCancel: (userId, sessionId, runId, input = {}) =>
      executionMutation(client, references.runCancel, { ...input, runId, sessionId, userId }).then((result) =>
        executionResultMap(result, (value) => ({ ...value, run: runRecordMap(value.run) })),
      ),
    runChildCreate: (userId, sessionId, input) =>
      executionMutation(client, references.runChildCreate, { ...input, sessionId, userId }).then((result) =>
        executionResultMap(result, (value) => ({
          ...value,
          attempt: attemptRecordMap(value.attempt),
          delegation: delegationRecordMap(value.delegation),
          run: runRecordMap(value.run),
        })),
      ),
    runChildStreamResolve: (userId, sessionId, streamId) =>
      executionQuery(client, references.runChildStreamResolve, { sessionId, streamId, userId }),
    runCreate: (userId, sessionId, input) =>
      executionMutation(client, references.runCreate, { ...input, sessionId, userId }).then((result) =>
        executionResultMap(result, (value) => ({
          ...value,
          attempt: attemptRecordMap(value.attempt),
          run: runRecordMap(value.run),
        })),
      ),
    runDelegationFinalize: (userId, sessionId, delegationId, result) =>
      executionMutation(client, references.runDelegationFinalize, { delegationId, result, sessionId, userId }).then(
        (value) =>
          executionResultMap(value, (entry) => ({
            ...entry,
            attempt: attemptRecordMap(entry.attempt),
            delegation: delegationRecordMap(entry.delegation),
            run: runRecordMap(entry.run),
          })),
      ),
    runLoad: (userId, sessionId, clientRunId) =>
      executionQuery(client, references.runLoad, { clientRunId, sessionId, userId }).then((result) =>
        executionResultMap(result, (value) => ({
          attempt: attemptRecordMap(value.attempt),
          attempts: value.attempts.map(attemptRecordMap),
          run: runRecordMap(value.run),
        })),
      ),
    runRetryAttemptCreate: (userId, sessionId, runId, options = {}) =>
      executionMutation(client, references.runRetryAttemptCreate, {
        ...(options.now === undefined ? {} : { now: options.now().getTime() }),
        runId,
        sessionId,
        userId,
      }).then((result) =>
        executionResultMap(result, (value) => ({
          ...value,
          attempt: attemptRecordMap(value.attempt),
          run: runRecordMap(value.run),
        })),
      ),
    runTransition: (userId, sessionId, runId, input) =>
      executionMutation(client, references.runTransition, { ...input, runId, sessionId, userId }).then((result) =>
        executionResultMap(result, (value) => ({
          ...value,
          attempt: attemptRecordMap(value.attempt),
          run: runRecordMap(value.run),
        })),
      ),
    streamAppend: (userId, sessionId, input) =>
      executionMutation(client, references.streamAppend, { ...input, sessionId, userId }).then((result) =>
        executionResultMap(result, (value) => ({ ...value, event: eventRecordMap(value.event) })),
      ),
    streamCheckpointAdvance: (userId, sessionId, streamId, lastSequence) =>
      executionMutation(client, references.streamCheckpointAdvance, { lastSequence, sessionId, streamId, userId }).then(
        (result) =>
          executionResultMap(result, (value) => ({ ...value, checkpoint: checkpointRecordMap(value.checkpoint) })),
      ),
    streamCheckpointLoadOrCreate: (userId, sessionId, streamId) =>
      executionMutation(client, references.streamCheckpointLoadOrCreate, { sessionId, streamId, userId }).then(
        (result) =>
          executionResultMap(result, (value) => ({ ...value, checkpoint: checkpointRecordMap(value.checkpoint) })),
      ),
    streamListAfter: (userId, sessionId, streamId, options) =>
      executionQuery(client, references.streamListAfter, { ...options, sessionId, streamId, userId }).then((result) =>
        executionResultMap(result, (value) => value.map(eventRecordMap)),
      ),
    streamReplayAppend: (userId, sessionId, input, inactivityTimeoutMs) =>
      executionMutation(client, references.streamReplayAppend, {
        ...input,
        inactivityTimeoutMs,
        sessionId,
        userId,
      }).then((result) =>
        executionResultMap(result, (value) => ({
          ...value,
          checkpoint: checkpointRecordMap(value.checkpoint),
          event: eventRecordMap(value.event),
        })),
      ),
    streamReplay: (userId, sessionId, streamId, input) =>
      executionMutation(client, references.streamReplay, { ...input, sessionId, streamId, userId }).then((result) =>
        executionResultMap(result, (value) => ({
          ...value,
          checkpoint: checkpointRecordMap(value.checkpoint),
          events: value.events.map(eventRecordMap),
        })),
      ),
    streamReplayStart: (userId, sessionId, streamId) =>
      executionMutation(client, references.streamReplayStart, { sessionId, streamId, userId }).then((result) =>
        executionResultMap(result, (value) => ({ ...value, checkpoint: checkpointRecordMap(value.checkpoint) })),
      ),
    streamEventLoad: (userId, sessionId, streamId, eventId) =>
      executionQuery(client, references.streamEventLoad, { eventId, sessionId, streamId, userId }).then((result) =>
        executionResultMap(result, (value) => (value === undefined ? undefined : eventRecordMap(value))),
      ),
    streamLatestEvent: (userId, sessionId, streamId, lastSequence) =>
      executionQuery(client, references.streamLatestEvent, { lastSequence, sessionId, streamId, userId }),
  }
}

function executionResultMap<T, U>(result: Result<T>, map: (value: T) => U): Result<U> {
  return result.success ? { success: true, data: map(result.data) } : result
}

function messageRecordMap(value: any): typeof messageTable.$inferSelect {
  return { ...value, createdAt: new Date(value.createdAt), finalizedAt: new Date(value.finalizedAt) }
}

function runRecordMap(value: any): RunRecord {
  return {
    ...value,
    cancellationRequestedAt: value.cancellationRequestedAt === null ? null : new Date(value.cancellationRequestedAt),
    createdAt: new Date(value.createdAt),
    deadlineAt: new Date(value.deadlineAt),
    finishedAt: value.finishedAt === null ? null : new Date(value.finishedAt),
    startedAt: value.startedAt === null ? null : new Date(value.startedAt),
    updatedAt: new Date(value.updatedAt),
  }
}

function attemptRecordMap(value: any): AttemptRecord {
  return {
    ...value,
    createdAt: new Date(value.createdAt),
    finishedAt: value.finishedAt === null ? null : new Date(value.finishedAt),
    startedAt: value.startedAt === null ? null : new Date(value.startedAt),
    updatedAt: new Date(value.updatedAt),
  }
}

function delegationRecordMap(value: any): DelegationRecord {
  return { ...value, createdAt: new Date(value.createdAt), updatedAt: new Date(value.updatedAt) }
}

function eventRecordMap(value: any): EventRecord {
  return { ...value, createdAt: new Date(value.createdAt) }
}

function checkpointRecordMap(value: any): CheckpointRecord {
  return { ...value, updatedAt: new Date(value.updatedAt) }
}

async function executionQuery(
  client: ConvexHttpClient,
  reference: any,
  args: Record<string, unknown>,
): Promise<Result<any>> {
  return executionCall(() => client.query(reference, args))
}

async function executionMutation(
  client: ConvexHttpClient,
  reference: any,
  args: Record<string, unknown>,
): Promise<Result<any>> {
  return executionCall(() => client.mutation(reference, args))
}

async function executionCall(call: () => Promise<unknown>): Promise<Result<any>> {
  try {
    const result = await call()
    if (!executionResultIs(result))
      return { success: false, op: "executionConvexCall", errorMessage: "The Convex response is invalid." }
    return result
  } catch (_error) {
    return { success: false, op: "executionConvexCall", errorMessage: "The Convex execution service is unavailable." }
  }
}

function executionResultIs(value: unknown): value is ConvexResult<unknown> {
  return typeof value === "object" && value !== null && "success" in value && typeof value.success === "boolean"
}

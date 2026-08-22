import { createResult, createResultError, createResultErrorCode, type Result } from "@adaptive-ds/result"
import type { ExecutionConvexClient } from "../../convex/executionConvexClient.js"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { databaseTransactionRun } from "../../database/databaseTransactionRun.js"
import type { streamCheckpointTable } from "../db/streamCheckpointTable.js"
import type { streamEventTable } from "../db/streamEventTable.js"
import { streamAppend } from "./streamAppend.js"
import { streamCheckpointAdvance } from "./streamCheckpointAdvance.js"
import { streamCheckpointLoadOrCreate } from "./streamCheckpointLoadOrCreate.js"
import { streamListAfter } from "./streamListAfter.js"

type StreamReplayServiceOptions = {
  database?: DatabaseClient
  executionConvexClient?: ExecutionConvexClient
  inactivityTimeoutMs: number
  now?: () => Date
  sessionId: string
  streamId: string
  userId: string
}

type StreamReplayAppendInput = {
  eventType: string
  idempotencyKey: string
  payload: unknown
  sequence: number
}

type StreamReplayOptions = {
  afterSequence?: number
  limit?: number
}

type StreamReplayAppendResult = {
  checkpoint: typeof streamCheckpointTable.$inferSelect
  created: boolean
  event: typeof streamEventTable.$inferSelect
}

type StreamReplayStartResult = {
  checkpoint: typeof streamCheckpointTable.$inferSelect
  created: boolean
}

function streamReplayServiceOptionsValidate(options: StreamReplayServiceOptions, op: string): Result<void> {
  if (!Number.isSafeInteger(options.inactivityTimeoutMs) || options.inactivityTimeoutMs <= 0) {
    return createResultError(op, "The stream inactivity timeout must be a positive integer.")
  }
  return createResult(undefined)
}

function streamReplayServiceNow(options: StreamReplayServiceOptions): Result<Date> {
  const now = options.now?.() ?? new Date()
  if (Number.isNaN(now.getTime())) return createResultError("streamReplayService", "The stream clock is invalid.")
  return createResult(now)
}

function streamReplayServiceStale(
  checkpoint: typeof streamCheckpointTable.$inferSelect,
  now: Date,
  inactivityTimeoutMs: number,
): boolean {
  return now.getTime() - checkpoint.updatedAt.getTime() >= inactivityTimeoutMs
}

export function streamReplayServiceCreate(options: StreamReplayServiceOptions) {
  const start = async (): Promise<Result<StreamReplayStartResult>> => {
    const op = "streamReplayServiceStart"
    const valid = streamReplayServiceOptionsValidate(options, op)
    if (!valid.success) return valid

    if (options.executionConvexClient !== undefined)
      return options.executionConvexClient.streamReplayStart(options.userId, options.sessionId, options.streamId)
    if (options.database === undefined) return createResultError(op, "The stream database is unavailable.")
    return databaseTransactionRun(options.database, async (transaction) => {
      const checkpoint = await streamCheckpointLoadOrCreate(
        transaction,
        options.userId,
        options.sessionId,
        options.streamId,
      )
      if (!checkpoint.success) return createResultError(op, checkpoint.errorMessage)
      return createResult(checkpoint.data)
    })
  }

  const append = async (input: StreamReplayAppendInput): Promise<Result<StreamReplayAppendResult>> => {
    const op = "streamReplayServiceAppend"
    const valid = streamReplayServiceOptionsValidate(options, op)
    if (!valid.success) return valid

    if (options.executionConvexClient !== undefined)
      return options.executionConvexClient.streamReplayAppend(
        options.userId,
        options.sessionId,
        { ...input, streamId: options.streamId },
        options.inactivityTimeoutMs,
      )
    if (options.database === undefined) return createResultError(op, "The stream database is unavailable.")
    return databaseTransactionRun(options.database, async (transaction): Promise<Result<StreamReplayAppendResult>> => {
      const checkpoint = await streamCheckpointLoadOrCreate(
        transaction,
        options.userId,
        options.sessionId,
        options.streamId,
      )
      if (!checkpoint.success) return createResultError(op, checkpoint.errorMessage)
      const now = streamReplayServiceNow(options)
      if (!now.success) return createResultError(op, now.errorMessage)

      const appended = await streamAppend(transaction, options.userId, options.sessionId, {
        ...input,
        streamId: options.streamId,
      })
      if (!appended.success) return createResultError(op, appended.errorMessage)
      if (!appended.data.created) {
        return createResult({
          checkpoint: checkpoint.data.checkpoint,
          created: false,
          event: appended.data.event,
        })
      }

      if (streamReplayServiceStale(checkpoint.data.checkpoint, now.data, options.inactivityTimeoutMs)) {
        return createResultErrorCode(op, "The stream is stale.", "stream_stale")
      }
      if (input.sequence !== checkpoint.data.checkpoint.lastSequence + 1) {
        return createResultError(op, "The stream event sequence must immediately follow the stream checkpoint.")
      }

      const advanced = await streamCheckpointAdvance(
        transaction,
        options.userId,
        options.sessionId,
        options.streamId,
        input.sequence,
      )
      if (!advanced.success) return createResultError(op, advanced.errorMessage)

      return createResult({
        checkpoint: advanced.data.checkpoint,
        created: true,
        event: appended.data.event,
      })
    })
  }

  const replay = async (
    input: StreamReplayOptions = {},
  ): Promise<
    Result<{
      checkpoint: typeof streamCheckpointTable.$inferSelect
      events: Array<typeof streamEventTable.$inferSelect>
      stale: boolean
    }>
  > => {
    const op = "streamReplayServiceReplay"
    const valid = streamReplayServiceOptionsValidate(options, op)
    if (!valid.success) return valid

    if (options.executionConvexClient !== undefined)
      return options.executionConvexClient.streamReplay(options.userId, options.sessionId, options.streamId, {
        afterSequence: input.afterSequence,
        inactivityTimeoutMs: options.inactivityTimeoutMs,
        limit: input.limit,
      })
    if (options.database === undefined) return createResultError(op, "The stream database is unavailable.")
    return databaseTransactionRun(options.database, async (transaction) => {
      const checkpoint = await streamCheckpointLoadOrCreate(
        transaction,
        options.userId,
        options.sessionId,
        options.streamId,
      )
      if (!checkpoint.success) return createResultError(op, checkpoint.errorMessage)
      const now = streamReplayServiceNow(options)
      if (!now.success) return createResultError(op, now.errorMessage)

      const events = await streamListAfter(transaction, options.userId, options.sessionId, options.streamId, {
        afterSequence: input.afterSequence ?? 0,
        limit: input.limit ?? 100,
      })
      if (!events.success) return createResultError(op, events.errorMessage)

      return createResult({
        checkpoint: checkpoint.data.checkpoint,
        events: events.data.filter((event) => event.sequence <= checkpoint.data.checkpoint.lastSequence),
        stale: streamReplayServiceStale(checkpoint.data.checkpoint, now.data, options.inactivityTimeoutMs),
      })
    })
  }

  return { append, replay, start }
}

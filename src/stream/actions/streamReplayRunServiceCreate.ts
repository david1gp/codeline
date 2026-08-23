import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { StreamChunk } from "@tanstack/ai"
import { and, asc, desc, eq, or } from "drizzle-orm"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { attemptTable } from "../../run/db/attemptTable.js"
import { runTable } from "../../run/db/runTable.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import { streamEventTable } from "../db/streamEventTable.js"
import { streamReplayErrorRetryableResolve } from "./streamReplayErrorRetryableResolve.js"
import { streamReplayServiceCreate } from "./streamReplayServiceCreate.js"

type StreamReplayRunServiceOptions = {
  database: DatabaseClient
  inactivityTimeoutMs: number
  sessionId: string
  streamId: string
  userId: string
}

type StreamReplayRunCursor = {
  targetIndex: number
  afterSequence: number
}

type StreamReplayEvent = typeof streamEventTable.$inferSelect

function streamReplayRunTargetsResolve(
  attempts: Array<typeof attemptTable.$inferSelect>,
  streamId: string,
): Array<{ streamId: string }> {
  if (attempts.length === 0) return [{ streamId }]
  return attempts.map((attempt) => ({ streamId: attempt.streamId }))
}

async function streamReplayRunTargetsLoad(
  options: StreamReplayRunServiceOptions,
): Promise<Result<Array<{ streamId: string }>>> {
  const op = "streamReplayRunService"
  try {
    const [run] = await options.database
      .select({ id: runTable.id })
      .from(runTable)
      .where(
        and(
          eq(runTable.userId, options.userId),
          eq(runTable.sessionId, options.sessionId),
          or(eq(runTable.streamId, options.streamId), eq(runTable.clientRunId, options.streamId)),
        ),
      )
      .limit(1)

    const runId =
      run?.id ??
      (
        await options.database
          .select({ runId: attemptTable.runId })
          .from(attemptTable)
          .where(
            and(
              eq(attemptTable.userId, options.userId),
              eq(attemptTable.sessionId, options.sessionId),
              eq(attemptTable.streamId, options.streamId),
            ),
          )
          .limit(1)
      )[0]?.runId

    if (runId === undefined) return createResult([{ streamId: options.streamId }])

    const attempts = await options.database
      .select()
      .from(attemptTable)
      .where(
        and(
          eq(attemptTable.runId, runId),
          eq(attemptTable.userId, options.userId),
          eq(attemptTable.sessionId, options.sessionId),
        ),
      )
      .orderBy(asc(attemptTable.ordinal))
    return createResult(streamReplayRunTargetsResolve(attempts, options.streamId))
  } catch (_error) {
    return createResultError(op, "The run could not be loaded.")
  }
}

async function streamReplayRunEventSequenceLoad(
  options: StreamReplayRunServiceOptions,
  streamId: string,
  eventId: string,
): Promise<Result<number | undefined>> {
  const op = "streamReplayRunCursor"
  try {
    const [event] = await options.database
      .select({ sequence: streamEventTable.sequence })
      .from(streamEventTable)
      .innerJoin(sessionTable, eq(streamEventTable.sessionId, sessionTable.id))
      .where(
        and(
          eq(sessionTable.userId, options.userId),
          eq(streamEventTable.sessionId, options.sessionId),
          eq(streamEventTable.streamId, streamId),
          eq(streamEventTable.id, eventId),
        ),
      )
      .limit(1)
    return createResult(event?.sequence)
  } catch (_error) {
    return createResultError(op, "The stream event cursor could not be loaded.")
  }
}

async function streamReplayRunLatestEventLoad(
  options: StreamReplayRunServiceOptions,
  streamId: string,
  lastSequence: number,
): Promise<Result<{ id: string } | undefined>> {
  const op = "streamReplayRunStatus"
  try {
    const [event] = await options.database
      .select({ id: streamEventTable.id })
      .from(streamEventTable)
      .innerJoin(sessionTable, eq(streamEventTable.sessionId, sessionTable.id))
      .where(
        and(
          eq(sessionTable.userId, options.userId),
          eq(streamEventTable.sessionId, options.sessionId),
          eq(streamEventTable.streamId, streamId),
          eq(streamEventTable.sequence, lastSequence),
        ),
      )
      .orderBy(desc(streamEventTable.sequence))
      .limit(1)
    return createResult(event === undefined ? undefined : { id: event.id })
  } catch (_error) {
    return createResultError(op, "The latest stream event could not be loaded.")
  }
}

function streamReplayRunLimitResolve(limit: number | undefined): Result<number> {
  const resolved = limit ?? 100
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > 100)
    return createResultError("streamReplayRunService", "The stream event limit must be between 1 and 100.")
  return createResult(resolved)
}

export function streamReplayRunServiceCreate(options: StreamReplayRunServiceOptions) {
  const cursor = async (eventId: string | undefined): Promise<Result<StreamReplayRunCursor>> => {
    const op = "streamReplayRunCursor"
    if (eventId === undefined || eventId === "") return createResult({ afterSequence: 0, targetIndex: 0 })
    if (eventId.length > 2_048 || /[\r\n]/.test(eventId))
      return createResultError(op, "The stream event cursor is invalid.")

    const targets = await streamReplayRunTargetsLoad(options)
    if (!targets.success) return targets
    for (const [targetIndex, target] of targets.data.entries()) {
      const event = await streamReplayRunEventSequenceLoad(options, target.streamId, eventId)
      if (!event.success) return event
      if (event.data !== undefined) return createResult({ afterSequence: event.data, targetIndex })
    }
    return createResultError(op, "The stream event cursor is invalid.")
  }

  const replay = async (
    input: { after: StreamReplayRunCursor; limit?: number } = { after: { afterSequence: 0, targetIndex: 0 } },
  ): Promise<Result<{ events: Array<StreamReplayEvent>; stale: boolean }>> => {
    const limit = streamReplayRunLimitResolve(input.limit)
    if (!limit.success) return limit
    const targets = await streamReplayRunTargetsLoad(options)
    if (!targets.success) return targets
    if (
      input.after.targetIndex < 0 ||
      input.after.targetIndex >= targets.data.length ||
      !Number.isSafeInteger(input.after.afterSequence) ||
      input.after.afterSequence < 0
    )
      return createResultError("streamReplayRunService", "The stream event cursor is invalid.")

    const events: Array<StreamReplayEvent> = []
    let stale = false
    for (const [targetIndex, target] of targets.data.entries()) {
      if (targetIndex < input.after.targetIndex) continue
      const afterSequence = targetIndex === input.after.targetIndex ? input.after.afterSequence : 0
      const replayed = await streamReplayServiceCreate({
        database: options.database,
        inactivityTimeoutMs: options.inactivityTimeoutMs,
        sessionId: options.sessionId,
        streamId: target.streamId,
        userId: options.userId,
      }).replay({
        afterSequence,
        limit: Math.max(1, limit.data - events.length),
      })
      if (!replayed.success) return createResultError("streamReplayRunService", replayed.errorMessage)
      if (targetIndex === targets.data.length - 1) stale = replayed.data.stale
      events.push(
        ...replayed.data.events
          .filter(
            (event) =>
              !(
                targetIndex < targets.data.length - 1 && streamReplayErrorRetryableResolve(event.payload as StreamChunk)
              ),
          )
          .slice(0, Math.max(0, limit.data - events.length)),
      )
    }

    return createResult({ events, stale })
  }

  const status = async (): Promise<Result<{ lastEventId: string | null; lastSequence: number; stale: boolean }>> => {
    const targets = await streamReplayRunTargetsLoad(options)
    if (!targets.success) return targets
    let lastSequence = 0
    let lastEventId: string | null = null
    let stale = false
    for (const [targetIndex, target] of targets.data.entries()) {
      const replayed = await streamReplayServiceCreate({
        database: options.database,
        inactivityTimeoutMs: options.inactivityTimeoutMs,
        sessionId: options.sessionId,
        streamId: target.streamId,
        userId: options.userId,
      }).replay({ afterSequence: 0, limit: 1 })
      if (!replayed.success) return createResultError("streamReplayRunService", replayed.errorMessage)
      lastSequence += replayed.data.checkpoint.lastSequence
      if (targetIndex === targets.data.length - 1) stale = replayed.data.stale
      if (replayed.data.checkpoint.lastSequence > 0) {
        const latest = await streamReplayRunLatestEventLoad(
          options,
          target.streamId,
          replayed.data.checkpoint.lastSequence,
        )
        if (!latest.success) return latest
        if (latest.data !== undefined) lastEventId = latest.data.id
      }
    }
    return createResult({ lastEventId, lastSequence, stale })
  }

  return { cursor, replay, status }
}

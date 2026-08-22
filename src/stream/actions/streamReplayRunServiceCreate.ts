import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { StreamChunk } from "@tanstack/ai"
import type { ExecutionConvexClient } from "../../convex/executionConvexClient.js"
import { streamReplayErrorRetryableResolve } from "./streamReplayErrorRetryableResolve.js"

type StreamReplayRunServiceOptions = {
  executionConvexClient: ExecutionConvexClient
  inactivityTimeoutMs: number
  sessionId: string
  streamId: string
  userId: string
}

type StreamReplayRunCursor = {
  targetIndex: number
  afterSequence: number
}

type StreamReplayResult =
  Awaited<ReturnType<ExecutionConvexClient["streamReplay"]>> extends Result<infer Value> ? Value : never
type StreamReplayEvent = StreamReplayResult["events"][number]

function streamReplayRunTargetsResolve(
  options: StreamReplayRunServiceOptions,
  loaded: Awaited<ReturnType<ExecutionConvexClient["runLoad"]>>,
): Array<{ streamId: string }> {
  if (!loaded.success) return [{ streamId: options.streamId }]
  const streams = loaded.data.attempts.map((attempt) => attempt.streamId)
  return streams.includes(options.streamId)
    ? streams.map((streamId) => ({ streamId }))
    : [{ streamId: options.streamId }]
}

async function streamReplayRunTargetsLoad(
  options: StreamReplayRunServiceOptions,
): Promise<Result<Array<{ streamId: string }>>> {
  const loaded = await options.executionConvexClient.runLoad(options.userId, options.sessionId, options.streamId)
  if (loaded.success) return createResult(streamReplayRunTargetsResolve(options, loaded))
  if (loaded.errorMessage === "The run could not be found.") return createResult([{ streamId: options.streamId }])
  return createResultError("streamReplayRunService", loaded.errorMessage)
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
      const event = await options.executionConvexClient.streamEventLoad(
        options.userId,
        options.sessionId,
        target.streamId,
        eventId,
      )
      if (!event.success) return createResultError(op, event.errorMessage)
      if (event.data !== undefined) return createResult({ afterSequence: event.data.sequence, targetIndex })
    }
    return createResultError(op, "The stream event cursor is invalid.")
  }

  const replay = async (
    input: { after: StreamReplayRunCursor; limit?: number } = { after: { afterSequence: 0, targetIndex: 0 } },
  ) => {
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

    const events: StreamReplayEvent[] = []
    let stale = false
    for (const [targetIndex, target] of targets.data.entries()) {
      if (targetIndex < input.after.targetIndex) continue
      const afterSequence = targetIndex === input.after.targetIndex ? input.after.afterSequence : 0
      const replayed = await options.executionConvexClient.streamReplay(
        options.userId,
        options.sessionId,
        target.streamId,
        {
          afterSequence,
          inactivityTimeoutMs: options.inactivityTimeoutMs,
          limit: Math.max(1, limit.data - events.length),
        },
      )
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
      const replayed = await options.executionConvexClient.streamReplay(
        options.userId,
        options.sessionId,
        target.streamId,
        {
          afterSequence: 0,
          inactivityTimeoutMs: options.inactivityTimeoutMs,
          limit: 1,
        },
      )
      if (!replayed.success) return createResultError("streamReplayRunService", replayed.errorMessage)
      lastSequence += replayed.data.checkpoint.lastSequence
      if (targetIndex === targets.data.length - 1) stale = replayed.data.stale
      if (replayed.data.checkpoint.lastSequence > 0) {
        const latest = await options.executionConvexClient.streamLatestEvent(
          options.userId,
          options.sessionId,
          target.streamId,
          replayed.data.checkpoint.lastSequence,
        )
        if (!latest.success) return createResultError("streamReplayRunService", latest.errorMessage)
        if (latest.data !== undefined) lastEventId = latest.data.id
      }
    }
    return createResult({ lastEventId, lastSequence, stale })
  }

  return { cursor, replay, status }
}

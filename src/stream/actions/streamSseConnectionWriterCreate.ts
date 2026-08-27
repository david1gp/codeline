import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import type { metricsCollectorCreate } from "../../metrics/metricsCollectorCreate.js"
import type { StreamSseFrame } from "../api/streamSseFrameSchema.js"
import { streamSseFrameSchema } from "../api/streamSseFrameSchema.js"
import { streamSseFrameSerialize } from "../api/streamSseFrameSerialize.js"
import type { JournalEvent } from "../schema/journalEventSchema.js"

type StreamSseConnectionWriterSink = {
  abort: (reason?: unknown) => Promise<void> | void
  close: () => Promise<void> | void
  write: (chunk: Uint8Array) => Promise<void>
}

type StreamSseConnectionWriterScheduler = {
  clearInterval: (handle: unknown) => void
  clearTimeout: (handle: unknown) => void
  setInterval: (handler: () => void, timeoutMs: number) => unknown
  setTimeout: (handler: () => void, timeoutMs: number) => unknown
}

type StreamSseConnectionWriterDependencies = {
  baselineSequence: number
  now: () => number
  scheduler: StreamSseConnectionWriterScheduler
  subscription: {
    subscribe: (userId: string, subscriber: (event: StreamSseConnectionInputEvent) => void) => () => void
  }
  userId: string
  writer: StreamSseConnectionWriterSink
  metricsCollector?: ReturnType<typeof metricsCollectorCreate>
}

type StreamSseConnectionQueueEvent = {
  allowBaseline: boolean
  bytes: Uint8Array
  sequence: number
}

type StreamSseConnectionInputEvent = JournalEvent | StreamSseFrame

const streamSseConnectionWriterHeartbeatIntervalMs = 15_000
const streamSseConnectionWriterBlockedWriteTimeoutMs = 15_000
const streamSseConnectionWriterMaximumQueueBytes = 1 * 1024 * 1024
const streamSseConnectionWriterMaximumQueueEvents = 1_024
const streamSseConnectionWriterMaximumReplayStagingBytes = 1 * 1024 * 1024
const streamSseConnectionWriterMaximumReplayStagingEvents = 128
const streamSseConnectionWriterMaximumFrameBytes = 128 * 1024
const streamSseConnectionWriterHeartbeat = new TextEncoder().encode(": heartbeat\n\n")

function streamSseConnectionFrameCreate(event: StreamSseConnectionInputEvent): Result<Uint8Array> {
  const op = "streamSseConnectionFrameCreate"
  try {
    const frame = "data" in event ? event : { data: event, event: event.eventType, id: event.id }
    const parsed = v.safeParse(streamSseFrameSchema, frame)
    if (!parsed.success) return createResultError(op, "The SSE event is invalid or exceeds 128 KiB.")

    const bytes = new TextEncoder().encode(streamSseFrameSerialize(parsed.output))
    if (bytes.byteLength > streamSseConnectionWriterMaximumFrameBytes)
      return createResultError(op, "The SSE event is invalid or exceeds 128 KiB.")
    return createResult(bytes)
  } catch (_error) {
    return createResultError(op, "The SSE event could not be serialized.")
  }
}

export function streamSseConnectionWriterCreate(dependencies: StreamSseConnectionWriterDependencies) {
  const eventQueue = new Map<number, StreamSseConnectionQueueEvent>()
  const replayQueue = new Map<number, StreamSseConnectionQueueEvent>()
  const heartbeatQueue: Uint8Array[] = []

  let resolveDisconnected: () => void = () => undefined
  const disconnectedPromise = new Promise<void>((resolve) => {
    resolveDisconnected = resolve
  })

  let resolveShutdown: () => void = () => undefined
  let shutdownPromise: Promise<void> | undefined
  let backlogOpen = true
  let connected = false
  let disconnected = false
  let draining = false
  let heartbeatTimer: unknown
  let blockedWriteTimer: unknown
  let subscriptionUnsubscribe: (() => void) | undefined
  let metricsConnectionOpened = false
  let queuedBytes = 0
  let replayQueuedBytes = 0
  let lastWrittenSequence = dependencies.baselineSequence
  let replayUpperBound: number | undefined
  let drainPromise: Promise<void> | undefined
  let maximumReplayStagingBytes = 0
  let maximumReplayStagingEvents = 0
  const replayCapacityWaiters: Array<() => void> = []

  const cleanupSubscription = (): void => {
    const unsubscribe = subscriptionUnsubscribe
    subscriptionUnsubscribe = undefined
    if (unsubscribe === undefined) return
    try {
      unsubscribe()
    } catch (_error) {
      // A failed unsubscribe must not prevent the rest of the connection cleanup.
    }
  }

  const timerClear = (): void => {
    if (heartbeatTimer !== undefined) {
      try {
        dependencies.scheduler.clearInterval(heartbeatTimer)
      } catch (_error) {
        // Continue cleanup if an injected scheduler rejects timer removal.
      }
      heartbeatTimer = undefined
    }
    if (blockedWriteTimer !== undefined) {
      try {
        dependencies.scheduler.clearTimeout(blockedWriteTimer)
      } catch (_error) {
        // Continue cleanup if an injected scheduler rejects timer removal.
      }
      blockedWriteTimer = undefined
    }
  }

  const shutdown = (mode: "abort" | "close", reason: unknown): Promise<void> => {
    if (shutdownPromise !== undefined) return shutdownPromise

    shutdownPromise = new Promise<void>((resolve) => {
      resolveShutdown = resolve
    })
    disconnected = true
    connected = false
    backlogOpen = false
    timerClear()
    cleanupSubscription()
    eventQueue.clear()
    replayQueue.clear()
    heartbeatQueue.length = 0
    queuedBytes = 0
    replayQueuedBytes = 0
    for (const resolve of replayCapacityWaiters.splice(0)) resolve()
    resolveDisconnected()

    if (metricsConnectionOpened) {
      dependencies.metricsCollector?.increment("sse_connections_active", -1)
      if (mode === "close") dependencies.metricsCollector?.increment("sse_connections_close_total")
      else
        dependencies.metricsCollector?.increment("sse_connections_disconnect_total", 1, {
          reason: typeof reason === "string" ? reason : "unknown",
        })
    }

    let operation: Promise<void> | void
    try {
      operation = mode === "abort" ? dependencies.writer.abort(reason) : dependencies.writer.close()
    } catch (_error) {
      operation = undefined
    }
    void Promise.resolve(operation).then(resolveShutdown, resolveShutdown)
    return shutdownPromise
  }

  const disconnect = (reason = "connection-disconnected"): Promise<void> => shutdown("abort", reason)

  const close = (): Promise<void> => shutdown("close", undefined)

  const staleEventQueueDiscard = (): void => {
    if (lastWrittenSequence === undefined) return
    for (const [sequence, event] of eventQueue) {
      if (sequence > lastWrittenSequence) continue
      eventQueue.delete(sequence)
      queuedBytes -= event.bytes.byteLength
    }
  }

  const replayQueueDelete = (sequence: number): void => {
    const event = replayQueue.get(sequence)
    if (event === undefined) return
    replayQueue.delete(sequence)
    queuedBytes -= event.bytes.byteLength
    replayQueuedBytes -= event.bytes.byteLength
    for (const resolve of replayCapacityWaiters.splice(0)) resolve()
  }

  const replayQueueNext = (): StreamSseConnectionQueueEvent | undefined => {
    let next: StreamSseConnectionQueueEvent | undefined
    for (const [sequence, event] of replayQueue) {
      if (lastWrittenSequence !== undefined && sequence <= lastWrittenSequence && !event.allowBaseline) {
        replayQueueDelete(sequence)
        continue
      }
      if (next === undefined || event.sequence < next.sequence) next = event
    }
    return next
  }

  const eventQueueNext = (): StreamSseConnectionQueueEvent | undefined => {
    staleEventQueueDiscard()
    let next: StreamSseConnectionQueueEvent | undefined
    for (const event of eventQueue.values()) {
      if (next === undefined || event.sequence < next.sequence) next = event
    }
    return next
  }

  const queueNext = (): StreamSseConnectionQueueEvent | undefined => {
    const replay = replayQueueNext()
    const live = eventQueueNext()
    if (replay === undefined) return live
    if (live === undefined) return replay
    return replay.sequence < live.sequence ? replay : live
  }

  const queueOverflowReason = (additionalBytes: number): "events" | "bytes" | undefined => {
    if (eventQueue.size + replayQueue.size + 1 > streamSseConnectionWriterMaximumQueueEvents) return "events"
    if (queuedBytes + additionalBytes > streamSseConnectionWriterMaximumQueueBytes) return "bytes"
    return undefined
  }

  const queueOverflowDisconnectReason = (reason: "events" | "bytes"): string =>
    reason === "events" ? "connection-queue-event-overflow" : "connection-queue-byte-overflow"

  const writeWithTimeout = async (bytes: Uint8Array): Promise<"disconnected" | "failed" | "written"> => {
    try {
      if (!Number.isFinite(dependencies.now())) return "failed"
    } catch (_error) {
      return "failed"
    }

    let writePromise: Promise<void>
    try {
      writePromise = Promise.resolve(dependencies.writer.write(bytes))
    } catch (_error) {
      return "failed"
    }

    try {
      blockedWriteTimer = dependencies.scheduler.setTimeout(() => {
        blockedWriteTimer = undefined
        dependencies.metricsCollector?.increment("sse_blocked_write_timeout_total")
        void disconnect("blocked-or-failed-write")
      }, streamSseConnectionWriterBlockedWriteTimeoutMs)
    } catch (_error) {
      return "failed"
    }

    const outcome = await Promise.race([
      writePromise.then(
        () => "written" as const,
        () => "failed" as const,
      ),
      disconnectedPromise.then(() => "disconnected" as const),
    ])
    if (blockedWriteTimer !== undefined) {
      try {
        dependencies.scheduler.clearTimeout(blockedWriteTimer)
      } catch (_error) {
        // The connection remains usable if an injected scheduler rejects timer removal.
      }
      blockedWriteTimer = undefined
    }
    return outcome
  }

  const drainShouldStart = (): boolean =>
    heartbeatQueue.length > 0 || replayQueue.size > 0 || (!backlogOpen && eventQueue.size > 0)

  const drainRun = async (): Promise<void> => {
    try {
      while (!disconnected) {
        const heartbeat = heartbeatQueue[0]
        const event = heartbeat === undefined && (replayQueue.size > 0 || !backlogOpen) ? queueNext() : undefined
        if (heartbeat === undefined && event === undefined) {
          draining = false
          return
        }

        const bytes = heartbeat ?? event?.bytes
        if (bytes === undefined) return
        const outcome = await writeWithTimeout(bytes)
        if (outcome !== "written") {
          if (outcome === "failed") dependencies.metricsCollector?.increment("sse_write_failure_total")
          if (!disconnected)
            await disconnect(outcome === "failed" ? "blocked-or-failed-write" : "connection-disconnected")
          return
        }
        if (disconnected) return

        if (heartbeat !== undefined) {
          if (heartbeatQueue[0] !== heartbeat) return
          heartbeatQueue.shift()
          queuedBytes -= heartbeat.byteLength
          continue
        }
        if (event !== undefined) {
          const replayEvent = replayQueue.get(event.sequence)
          const liveEvent = eventQueue.get(event.sequence)
          if (replayEvent !== event && liveEvent !== event) return
          if (replayEvent === event) replayQueueDelete(event.sequence)
          if (liveEvent === event) {
            eventQueue.delete(event.sequence)
            queuedBytes -= event.bytes.byteLength
          }
          if (lastWrittenSequence === undefined || event.sequence > lastWrittenSequence)
            lastWrittenSequence = event.sequence
          staleEventQueueDiscard()
        }
      }
    } catch (_error) {
      dependencies.metricsCollector?.increment("sse_write_failure_total")
      if (!disconnected) await disconnect("connection-write-failed")
    }
  }

  const drainStart = (): void => {
    if (draining || disconnected) return
    draining = true
    const currentDrain = drainRun()
    drainPromise = currentDrain
    void currentDrain.then(
      () => {
        if (drainPromise !== currentDrain) return
        draining = false
        if (drainShouldStart()) drainStart()
      },
      () => {
        if (drainPromise !== currentDrain) return
        draining = false
        dependencies.metricsCollector?.increment("sse_write_failure_total")
        if (!disconnected) void disconnect("connection-write-failed")
      },
    )
  }

  const enqueueHeartbeat = (): void => {
    if (!connected || disconnected) return
    if (queuedBytes + streamSseConnectionWriterHeartbeat.byteLength > streamSseConnectionWriterMaximumQueueBytes) {
      dependencies.metricsCollector?.increment("sse_queue_overflow_total", 1, { reason: "bytes" })
      void disconnect("connection-queue-byte-overflow")
      return
    }
    heartbeatQueue.push(streamSseConnectionWriterHeartbeat)
    queuedBytes += streamSseConnectionWriterHeartbeat.byteLength
    drainStart()
  }

  const enqueueEvent = (event: StreamSseConnectionInputEvent): Result<void> => {
    const op = "streamSseConnectionWriterEnqueueEvent"
    if (disconnected) return createResultError(op, "The SSE connection is disconnected.")
    const sequence = "data" in event ? event.data.sequence : event.sequence
    if (lastWrittenSequence !== undefined && sequence <= lastWrittenSequence) return createResult(undefined)
    if (replayUpperBound !== undefined && sequence <= replayUpperBound) return createResult(undefined)
    if (eventQueue.has(sequence) || replayQueue.has(sequence)) return createResult(undefined)

    const frame = streamSseConnectionFrameCreate(event)
    if (!frame.success) {
      void disconnect("connection-frame-invalid")
      return frame
    }
    const overflowReason = queueOverflowReason(frame.data.byteLength)
    if (overflowReason !== undefined) {
      dependencies.metricsCollector?.increment("sse_queue_overflow_total", 1, {
        reason: overflowReason,
      })
      void disconnect(queueOverflowDisconnectReason(overflowReason))
      return createResultError(op, "The SSE connection queue limit was exceeded.")
    }

    eventQueue.set(sequence, { allowBaseline: false, bytes: frame.data, sequence })
    queuedBytes += frame.data.byteLength
    if (!backlogOpen) drainStart()
    return createResult(undefined)
  }

  const liveEventReceive = (event: StreamSseConnectionInputEvent): void => {
    enqueueEvent(event)
  }

  const connect = (): Result<void> => {
    const op = "streamSseConnectionWriterConnect"
    if (connected) return createResultError(op, "The SSE connection is already connected.")
    if (disconnected) return createResultError(op, "The SSE connection is disconnected.")

    connected = true
    try {
      const unsubscribe = dependencies.subscription.subscribe(dependencies.userId, liveEventReceive)
      if (disconnected) {
        try {
          unsubscribe()
        } catch (_error) {
          // The connection is already being cleaned up.
        }
        return createResultError(op, "The SSE connection disconnected during subscription.")
      }
      subscriptionUnsubscribe = unsubscribe
      heartbeatTimer = dependencies.scheduler.setInterval(
        enqueueHeartbeat,
        streamSseConnectionWriterHeartbeatIntervalMs,
      )
      metricsConnectionOpened = true
      dependencies.metricsCollector?.increment("sse_connections_open_total")
      dependencies.metricsCollector?.increment("sse_connections_active")
      return createResult(undefined)
    } catch (_error) {
      void disconnect("connection-subscription-failed")
      return createResultError(op, "The SSE connection could not subscribe.")
    }
  }

  const setReplayUpperBound = (upperBound: number): Result<void> => {
    const op = "streamSseConnectionWriterSetReplayUpperBound"
    if (disconnected) return createResultError(op, "The SSE connection is disconnected.")
    if (!Number.isSafeInteger(upperBound) || upperBound < 0)
      return createResultError(op, "The SSE replay upper bound is invalid.")
    replayUpperBound = upperBound
    for (const [sequence, event] of eventQueue) {
      if (sequence > upperBound) continue
      eventQueue.delete(sequence)
      queuedBytes -= event.bytes.byteLength
    }
    return createResult(undefined)
  }

  const replayCapacityWait = async (frameBytes: number): Promise<boolean> => {
    while (
      !disconnected &&
      (replayQueue.size >= streamSseConnectionWriterMaximumReplayStagingEvents ||
        replayQueuedBytes + frameBytes > streamSseConnectionWriterMaximumReplayStagingBytes)
    ) {
      await new Promise<void>((resolve) => replayCapacityWaiters.push(resolve))
    }
    return !disconnected
  }

  const enqueueBacklog = async (events: readonly StreamSseConnectionInputEvent[]): Promise<Result<void>> => {
    const op = "streamSseConnectionWriterEnqueueBacklog"
    if (!connected) return createResultError(op, "The SSE connection must subscribe before its backlog is enqueued.")
    if (!backlogOpen) return createResultError(op, "The SSE backlog handoff is already complete.")
    for (const event of events) {
      if (disconnected) return createResultError(op, "The SSE connection is disconnected.")
      const sequence = "data" in event ? event.data.sequence : event.sequence
      const isReset = ("data" in event ? event.data.eventType : event.eventType) === "reset"
      if (lastWrittenSequence !== undefined && sequence <= lastWrittenSequence && !isReset) continue
      if (replayQueue.has(sequence) || (!isReset && eventQueue.has(sequence))) continue

      const frame = streamSseConnectionFrameCreate(event)
      if (!frame.success) {
        void disconnect("connection-frame-invalid")
        return frame
      }
      const capacityAvailable = await replayCapacityWait(frame.data.byteLength)
      if (!capacityAvailable) return createResultError(op, "The SSE connection is disconnected.")
      if (disconnected) return createResultError(op, "The SSE connection is disconnected.")
      if (lastWrittenSequence !== undefined && sequence <= lastWrittenSequence && !isReset) continue
      if (replayQueue.has(sequence) || (!isReset && eventQueue.has(sequence))) continue
      const overflowReason = queueOverflowReason(frame.data.byteLength)
      if (overflowReason !== undefined) {
        dependencies.metricsCollector?.increment("sse_queue_overflow_total", 1, {
          reason: overflowReason,
        })
        void disconnect(queueOverflowDisconnectReason(overflowReason))
        return createResultError(op, "The SSE connection queue limit was exceeded.")
      }
      replayQueue.set(sequence, { allowBaseline: isReset, bytes: frame.data, sequence })
      queuedBytes += frame.data.byteLength
      replayQueuedBytes += frame.data.byteLength
      maximumReplayStagingBytes = Math.max(maximumReplayStagingBytes, replayQueuedBytes)
      maximumReplayStagingEvents = Math.max(maximumReplayStagingEvents, replayQueue.size)
      drainStart()
    }
    return createResult(undefined)
  }

  const completeBacklog = (): Result<void> => {
    const op = "streamSseConnectionWriterCompleteBacklog"
    if (!connected) return createResultError(op, "The SSE connection must subscribe before backlog handoff completes.")
    if (!backlogOpen) return createResultError(op, "The SSE backlog handoff is already complete.")
    backlogOpen = false
    drainStart()
    return createResult(undefined)
  }

  const waitForIdle = async (): Promise<void> => {
    while (draining) {
      const current = drainPromise
      if (current === undefined) return
      await current
    }
  }

  return {
    close,
    completeBacklog,
    connect,
    disconnect,
    enqueueBacklog,
    isDisconnected: () => disconnected,
    queuedByteCount: () => queuedBytes,
    queuedEventCount: () => eventQueue.size,
    queuedReplayByteCount: () => replayQueuedBytes,
    queuedReplayEventCount: () => replayQueue.size,
    maximumReplayStagingByteCount: () => maximumReplayStagingBytes,
    maximumReplayStagingEventCount: () => maximumReplayStagingEvents,
    setReplayUpperBound,
    waitForIdle,
  }
}

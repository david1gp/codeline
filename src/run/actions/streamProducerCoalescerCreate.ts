import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { type StreamProducerDelta, streamProducerDeltaSchema } from "../schema/streamProducerDeltaSchema.js"

const streamProducerCoalescerDefaultIntervalMs = 500
const streamProducerCoalescerMaximumSerializedEventBytes = 128 * 1024
const streamProducerCoalescerTextEncoder = new TextEncoder()

type StreamProducerCoalescerScheduler = {
  clearTimeout: (handle: unknown) => void
  setTimeout: (handler: () => void, timeoutMs: number) => unknown
}

type StreamProducerCoalescerDependencies = {
  onFlush: (event: StreamProducerDelta) => void
  scheduler: StreamProducerCoalescerScheduler
  flushIntervalMs?: number
  serialize?: (event: StreamProducerDelta) => string
}

type StreamProducerCoalescerTimer = {
  active: boolean
  handle: unknown | undefined
}

type StreamProducerCoalescerBuffer = {
  event: StreamProducerDelta
  timer: StreamProducerCoalescerTimer | undefined
}

function streamProducerCoalescerEventKey(event: StreamProducerDelta): string {
  return JSON.stringify([event.runId, event.messageId, event.deltaKind])
}

function streamProducerCoalescerSerialize(event: StreamProducerDelta): string {
  return JSON.stringify(event)
}

function streamProducerCoalescerIntervalResolve(dependencies: StreamProducerCoalescerDependencies): Result<number> {
  const op = "streamProducerCoalescerCreate"
  const interval = dependencies.flushIntervalMs ?? streamProducerCoalescerDefaultIntervalMs
  if (!Number.isSafeInteger(interval) || interval <= 0)
    return createResultError(op, "The producer coalescing interval must be a positive integer.")
  return createResult(interval)
}

function streamProducerCoalescerEventSize(
  event: StreamProducerDelta,
  serialize: (event: StreamProducerDelta) => string,
): Result<number> {
  const op = "streamProducerCoalescer"
  let serialized: string
  try {
    serialized = serialize(event)
  } catch (_error) {
    return createResultError(op, "The producer event could not be serialized.")
  }
  if (typeof serialized !== "string")
    return createResultError(op, "The producer event serializer must return a string.")

  const size = streamProducerCoalescerTextEncoder.encode(serialized).byteLength
  if (size > streamProducerCoalescerMaximumSerializedEventBytes)
    return createResultError(op, "The serialized producer event exceeds 128 KiB.")
  return createResult(size)
}

function streamProducerCoalescerEventCreate(input: unknown): Result<StreamProducerDelta> {
  const op = "streamProducerCoalescer"
  const parsed = v.safeParse(streamProducerDeltaSchema, input)
  if (!parsed.success) return createResultError(op, v.summarize(parsed.issues))
  return createResult(parsed.output)
}

export function streamProducerCoalescerCreate(dependencies: StreamProducerCoalescerDependencies) {
  const interval = streamProducerCoalescerIntervalResolve(dependencies)
  const serialize = dependencies.serialize ?? streamProducerCoalescerSerialize
  const buffers = new Map<string, StreamProducerCoalescerBuffer>()
  const firstFragmentsFlushed = new Set<string>()
  const firstFragmentTimers = new Map<string, StreamProducerCoalescerTimer>()

  const timerClear = (timer: StreamProducerCoalescerTimer | undefined): void => {
    if (timer === undefined || !timer.active) return
    timer.active = false
    if (timer.handle === undefined) return
    try {
      dependencies.scheduler.clearTimeout(timer.handle)
    } catch (_error) {
      // A failed timer cleanup must not retain an already-flushed buffer.
    }
  }

  const eventPublish = (event: StreamProducerDelta): Result<void> => {
    const op = "streamProducerCoalescer"
    try {
      dependencies.onFlush(event)
      return createResult(undefined)
    } catch (_error) {
      return createResultError(op, "The producer event could not be published.")
    }
  }

  const bufferFlush = (key: string): Result<void> => {
    const buffer = buffers.get(key)
    if (buffer === undefined) return createResult(undefined)
    buffers.delete(key)
    firstFragmentsFlushed.delete(key)
    firstFragmentTimers.delete(key)
    timerClear(buffer.timer)
    return eventPublish(buffer.event)
  }

  const firstFragmentTimerSchedule = (key: string): Result<StreamProducerCoalescerTimer> => {
    const op = "streamProducerCoalescer"
    const timer: StreamProducerCoalescerTimer = { active: true, handle: undefined }
    firstFragmentTimers.set(key, timer)
    try {
      timer.handle = dependencies.scheduler.setTimeout(
        () => {
          const current = buffers.get(key)
          if (current?.timer === timer) {
            void bufferFlush(key)
            return
          }
          if (firstFragmentTimers.get(key) !== timer) return
          timer.active = false
          firstFragmentTimers.delete(key)
          firstFragmentsFlushed.delete(key)
        },
        interval.success ? interval.data : streamProducerCoalescerDefaultIntervalMs,
      )
      return createResult(timer)
    } catch (_error) {
      firstFragmentTimers.delete(key)
      timer.active = false
      return createResultError(op, "The producer coalescing timer could not be scheduled.")
    }
  }

  const firstFragmentPublish = (event: StreamProducerDelta, key: string): Result<void> => {
    const published = eventPublish(event)
    if (!published.success) return published
    firstFragmentsFlushed.add(key)
    const timer = firstFragmentTimerSchedule(key)
    if (!timer.success) {
      firstFragmentsFlushed.delete(key)
      return timer
    }
    return published
  }

  const append = (input: unknown): Result<void> => {
    const event = streamProducerCoalescerEventCreate(input)
    if (!event.success) return event
    if (!interval.success) return interval

    const inputSize = streamProducerCoalescerEventSize(event.data, serialize)
    if (!inputSize.success) return inputSize

    const key = streamProducerCoalescerEventKey(event.data)
    const buffer = buffers.get(key)
    if (buffer === undefined) {
      if (!firstFragmentsFlushed.has(key)) return firstFragmentPublish(event.data, key)
      const timer = firstFragmentTimers.get(key)
      if (timer === undefined) {
        firstFragmentsFlushed.delete(key)
        return firstFragmentPublish(event.data, key)
      }
      firstFragmentTimers.delete(key)
      firstFragmentsFlushed.delete(key)
      buffers.set(key, { event: event.data, timer })
      return createResult(undefined)
    }

    const combined = { ...buffer.event, delta: buffer.event.delta + event.data.delta }
    const combinedSize = streamProducerCoalescerEventSize(combined, serialize)
    if (combinedSize.success) {
      buffer.event = combined
      return createResult(undefined)
    }

    const flushed = bufferFlush(key)
    if (!flushed.success) return flushed
    return firstFragmentPublish(event.data, key)
  }

  const flushAll = (): Result<void> => {
    let firstError: Result<void> | undefined
    for (const key of [...buffers.keys()]) {
      const flushed = bufferFlush(key)
      if (!flushed.success && firstError === undefined) firstError = flushed
    }
    for (const timer of firstFragmentTimers.values()) timerClear(timer)
    firstFragmentTimers.clear()
    firstFragmentsFlushed.clear()
    return firstError ?? createResult(undefined)
  }

  const pendingCount = (): number => buffers.size

  return { append, flushAll, pendingCount }
}

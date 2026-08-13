import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import {
  type ProviderExecutionEvent,
  providerExecutionEventSchema,
} from "../../providers/schema/providerExecutionEventSchema.js"
import { type ExecutionStreamEvent, executionStreamEventSchema } from "../schema/executionStreamEventSchema.js"

const CONTENT_LIMIT = 16_384
const STRING_LIMIT = 4_096
const COLLECTION_LIMIT = 50
const DEPTH_LIMIT = 5
const sensitiveKeyPattern = /(^|[_-])(authorization|cookie|credential|password|secret|token|api[_-]?key)($|[_-])/i

type ExecutionValueNormalization = {
  truncated: boolean
  value: unknown
}

function executionStringRedact(value: string): string {
  return value
    .replace(/\bBearer\s+[^\s"',}]+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:sk|gh[pousr])[-_][A-Za-z0-9_-]{8,}\b/g, "[REDACTED]")
    .replace(/(https?:\/\/[^\s/:@]+:)[^\s/@]+@/gi, "$1[REDACTED]@")
}

function executionValueNormalize(input: unknown, depth: number, seen: Set<object>): ExecutionValueNormalization {
  if (input === null || typeof input === "boolean") return { truncated: false, value: input }
  if (typeof input === "number") {
    return Number.isFinite(input)
      ? { truncated: false, value: input }
      : { truncated: true, value: "[Unsupported number]" }
  }
  if (typeof input === "string") {
    const redacted = executionStringRedact(input)
    if (redacted.length <= STRING_LIMIT) return { truncated: false, value: redacted }
    return { truncated: true, value: `${redacted.slice(0, STRING_LIMIT - 12)}[Truncated]` }
  }
  if (depth >= DEPTH_LIMIT) return { truncated: true, value: "[Truncated]" }
  if (typeof input !== "object" || input === undefined) return { truncated: true, value: "[Unsupported]" }
  if (seen.has(input)) return { truncated: true, value: "[Circular]" }
  seen.add(input)

  if (Array.isArray(input)) {
    let truncated = input.length > COLLECTION_LIMIT
    const value = input.slice(0, COLLECTION_LIMIT).map((entry) => {
      const normalized = executionValueNormalize(entry, depth + 1, seen)
      truncated ||= normalized.truncated
      return normalized.value
    })
    seen.delete(input)
    return { truncated, value }
  }

  const prototype = Object.getPrototypeOf(input)
  if (prototype !== Object.prototype && prototype !== null) {
    seen.delete(input)
    return { truncated: true, value: "[Unsupported object]" }
  }

  const entries = Object.entries(input).sort(([left], [right]) => left.localeCompare(right))
  let truncated = entries.length > COLLECTION_LIMIT
  const value: Record<string, unknown> = {}
  for (const [rawKey, entry] of entries.slice(0, COLLECTION_LIMIT)) {
    const key = rawKey.slice(0, 128)
    if (key !== rawKey) truncated = true
    if (sensitiveKeyPattern.test(key)) {
      value[key] = "[REDACTED]"
      continue
    }
    const normalized = executionValueNormalize(entry, depth + 1, seen)
    truncated ||= normalized.truncated
    value[key] = normalized.value
  }
  seen.delete(input)
  return { truncated, value }
}

function executionValueSerialize(input: unknown): { content: string; truncated: boolean } {
  const normalized = executionValueNormalize(input, 0, new Set())
  const serialized = JSON.stringify(normalized.value)
  if (serialized.length <= CONTENT_LIMIT) return { content: serialized, truncated: normalized.truncated }
  return {
    content: `${serialized.slice(0, CONTENT_LIMIT - 12)}[Truncated]`,
    truncated: true,
  }
}

function executionStreamEventParse(input: unknown): Result<ExecutionStreamEvent> {
  const op = "executionStreamEventNormalize"
  const parsed = v.safeParse(executionStreamEventSchema, input)
  if (!parsed.success) return createResultError(op, v.summarize(parsed.issues))
  return createResult(parsed.output)
}

export function executionStreamEventNormalize(input: unknown): Result<ExecutionStreamEvent> {
  const op = "executionStreamEventNormalize"
  const providerEvent = v.safeParse(providerExecutionEventSchema, input)
  if (!providerEvent.success) return createResultError(op, v.summarize(providerEvent.issues))
  const event: ProviderExecutionEvent = providerEvent.output

  if (event.type === "text_delta") {
    return executionStreamEventParse({
      eventType: event.type,
      payload: { delta: executionStringRedact(event.delta) },
    })
  }
  if (event.type === "thinking_status") {
    return executionStreamEventParse({ eventType: event.type, payload: { status: event.status } })
  }
  if (event.type === "tool_start") {
    return executionStreamEventParse({
      eventType: event.type,
      payload: { toolCallId: event.toolCallId, toolName: event.toolName },
    })
  }
  if (event.type === "tool_output") {
    const output = executionValueSerialize(event.output)
    return executionStreamEventParse({
      eventType: event.type,
      payload: { output: output.content, toolCallId: event.toolCallId, truncated: output.truncated },
    })
  }
  if (event.type === "tool_result") {
    const result = executionValueSerialize(event.result)
    return executionStreamEventParse({
      eventType: event.type,
      payload: {
        outcome: event.outcome,
        result: result.content,
        toolCallId: event.toolCallId,
        truncated: result.truncated,
      },
    })
  }
  if (event.type === "written_file") {
    return executionStreamEventParse({ eventType: event.type, payload: { path: event.path } })
  }

  return executionStreamEventParse({
    eventType: event.type,
    payload: {
      ...(event.code === undefined ? {} : { code: event.code }),
      ...(event.message === undefined ? {} : { message: executionStringRedact(event.message).slice(0, 4_096) }),
      status: event.status,
    },
  })
}

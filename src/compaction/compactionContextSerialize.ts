import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { CompactionMessage } from "./compactionMessage.js"

function compactionValueSerialize(value: unknown, seen: Set<object>): string {
  if (value === null || value === undefined) return "null"
  if (typeof value === "string") return JSON.stringify(value)
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null"
  if (typeof value === "bigint") return JSON.stringify(`${value}n`)
  if (typeof value === "function" || typeof value === "symbol") return "null"
  if (seen.has(value)) throw new Error("Circular value")
  seen.add(value)
  if (Array.isArray(value)) {
    const serialized = `[${value.map((item) => compactionValueSerialize(item, seen)).join(",")}]`
    seen.delete(value)
    return serialized
  }
  const record = value as Record<string, unknown>
  const serialized = `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${compactionValueSerialize(record[key], seen)}`)
    .join(",")}}`
  seen.delete(value)
  return serialized
}

function compactionToolOutputBound(value: unknown, maxChars: number): unknown {
  const serialized = compactionValueSerialize(value, new Set())
  if (serialized.length <= maxChars) return value
  const marker = `…[tool output truncated; ${serialized.length - maxChars} chars omitted]`
  return serialized.slice(0, Math.max(0, maxChars - marker.length)) + marker.slice(0, maxChars)
}

function compactionMessageMetadataSerializable(metadata: unknown): unknown {
  if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) return metadata
  const record = metadata as Record<string, unknown>
  if (!Object.hasOwn(record, "__codeline_reported_usage")) return metadata
  const { __codeline_reported_usage: _reportedUsage, ...withoutReportedUsage } = record
  return withoutReportedUsage
}

function compactionMessageSerializable(
  message: CompactionMessage,
  maxToolOutputChars: number,
): Record<string, unknown> {
  const output: Record<string, unknown> = { role: message.role }
  if (message.id !== undefined) output.id = message.id
  if (message.toolCallId !== undefined) output.toolCallId = message.toolCallId
  if (message.toolCalls !== undefined) output.toolCalls = message.toolCalls
  if (message.content !== undefined) {
    output.content =
      message.role === "tool" ? compactionToolOutputBound(message.content, maxToolOutputChars) : message.content
  }
  if (message.metadata !== undefined) {
    const metadata = compactionMessageMetadataSerializable(message.metadata)
    if (typeof metadata !== "object" || metadata === null || Object.keys(metadata).length > 0)
      output.metadata = metadata
  }
  return output
}

export function compactionContextSerialize(
  messages: readonly CompactionMessage[],
  options: { maxToolOutputChars?: number } = {},
): Result<string> {
  const op = "compactionContextSerialize"
  const maxToolOutputChars = options.maxToolOutputChars ?? 12_000
  if (!Number.isSafeInteger(maxToolOutputChars) || maxToolOutputChars < 0) {
    return createResultError(op, "maxToolOutputChars must be a non-negative integer.")
  }
  try {
    const serializedMessages = messages.map((message) => compactionMessageSerializable(message, maxToolOutputChars))
    return createResult(compactionValueSerialize(serializedMessages, new Set()))
  } catch {
    return createResultError(op, "The context contains a value that cannot be serialized safely.")
  }
}

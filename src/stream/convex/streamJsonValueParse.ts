import { createResult, createResultError, type Result } from "@adaptive-ds/result"

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

export function streamJsonValueParse(value: unknown): Result<JsonValue> {
  const op = "streamJsonValueParse"
  if (value === null || typeof value === "string" || typeof value === "boolean") return createResult(value)
  if (typeof value === "number" && Number.isFinite(value)) return createResult(value)
  if (Array.isArray(value)) {
    const entries: JsonValue[] = []
    for (const entry of value) {
      const parsed = streamJsonValueParse(entry)
      if (!parsed.success) return createResultError(op, "The stream event payload must be valid JSON.")
      entries.push(parsed.data)
    }
    return createResult(entries)
  }
  if (typeof value === "object" && value !== null) {
    const entries: Record<string, JsonValue> = {}
    for (const [key, entry] of Object.entries(value)) {
      const parsed = streamJsonValueParse(entry)
      if (!parsed.success) return createResultError(op, "The stream event payload must be valid JSON.")
      entries[key] = parsed.data
    }
    return createResult(entries)
  }
  return createResultError(op, "The stream event payload must be valid JSON.")
}

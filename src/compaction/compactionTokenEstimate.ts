import { createResult, createResultError, type Result } from "@adaptive-ds/result"

function compactionTokenEstimateSerialize(value: unknown, seen: Set<object>): string {
  if (value === null || value === undefined) return "null"
  if (typeof value === "string") return JSON.stringify(value)
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null"
  if (typeof value === "bigint") return JSON.stringify(`${value}n`)
  if (typeof value === "function" || typeof value === "symbol") return "null"
  if (seen.has(value)) throw new Error("Circular value")
  seen.add(value)
  if (Array.isArray(value)) {
    const output = `[${value.map((item) => compactionTokenEstimateSerialize(item, seen)).join(",")}]`
    seen.delete(value)
    return output
  }
  const record = value as Record<string, unknown>
  const output = `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${compactionTokenEstimateSerialize(record[key], seen)}`)
    .join(",")}}`
  seen.delete(value)
  return output
}

export function compactionTokenEstimate(input: unknown): Result<number> {
  const op = "compactionTokenEstimate"
  try {
    const serialized = compactionTokenEstimateSerialize(input, new Set())
    const bytes = new TextEncoder().encode(serialized).byteLength
    const messageOverhead = Array.isArray(input) ? input.length * 4 : 0
    return createResult(Math.max(0, Math.ceil(bytes / 3) + messageOverhead))
  } catch {
    return createResultError(op, "The value cannot be estimated safely.")
  }
}

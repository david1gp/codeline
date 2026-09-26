import * as v from "valibot"
import { apiDiagnosticsLimits } from "./apiDiagnosticsLimits.js"

const boundedString = (maxLength: number) => v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(maxLength))

const structuredDataSchema = v.pipe(
  v.unknown(),
  v.check((value) => structuredDataIsBounded(value), "The diagnostic structured data is too large or invalid."),
)

const clientLogSchema = v.strictObject({
  data: v.optional(structuredDataSchema),
  level: v.picklist(["debug", "info", "warn", "error"]),
  message: boundedString(apiDiagnosticsLimits.maxMessageLength),
  source: v.optional(boundedString(apiDiagnosticsLimits.maxSourceLength)),
  stack: v.optional(boundedString(apiDiagnosticsLimits.maxStackLength)),
  timestamp: v.optional(
    v.union([
      v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(Number.MAX_SAFE_INTEGER)),
      boundedString(apiDiagnosticsLimits.maxTimestampLength),
    ]),
  ),
  url: v.optional(boundedString(apiDiagnosticsLimits.maxUrlLength)),
})

export const apiClientLogRequestSchema = v.strictObject({
  logs: v.pipe(v.array(clientLogSchema), v.minLength(1), v.maxLength(apiDiagnosticsLimits.maxBatchSize)),
})

export type ApiClientLogRequest = v.InferOutput<typeof apiClientLogRequestSchema>

function structuredDataIsBounded(value: unknown): boolean {
  const seen = new Set<object>()
  let nodes = 0

  const visit = (current: unknown, depth: number): boolean => {
    nodes += 1
    if (nodes > apiDiagnosticsLimits.maxStructuredNodes) return false
    if (current === null || typeof current === "boolean") return true
    if (typeof current === "number") return Number.isFinite(current)
    if (typeof current === "string") return current.length <= apiDiagnosticsLimits.maxStructuredStringLength
    if (typeof current !== "object" || depth >= apiDiagnosticsLimits.maxStructuredDepth) return false
    if (seen.has(current)) return false
    seen.add(current)

    let valid = true
    if (Array.isArray(current)) {
      valid = current.length <= apiDiagnosticsLimits.maxStructuredEntries
      if (valid) {
        for (const child of current) {
          if (!visit(child, depth + 1)) {
            valid = false
            break
          }
        }
      }
    } else {
      const entries = Object.entries(current)
      valid = entries.length <= apiDiagnosticsLimits.maxStructuredEntries
      if (valid) {
        for (const [key, child] of entries) {
          if (key.length > apiDiagnosticsLimits.maxStructuredStringLength || !visit(child, depth + 1)) {
            valid = false
            break
          }
        }
      }
    }

    seen.delete(current)
    return valid
  }

  return visit(value, 0)
}

import type { CompactionTokenUsage } from "./compactionTokenUsage.js"

type UsageRecord = Record<string, unknown>

function usageRecordResolve(value: unknown): UsageRecord | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined
  return value as UsageRecord
}

function usageNumberResolve(record: UsageRecord, names: readonly string[]): number | undefined | null {
  for (const name of names) {
    if (!Object.hasOwn(record, name) || record[name] === undefined) continue
    const value = record[name]
    if (!Number.isSafeInteger(value) || (value as number) < 0) return null
    return value as number
  }
  return undefined
}

function usageStatusIsInvalid(record: UsageRecord): boolean {
  if (record.stale === true) return true
  const status = typeof record.status === "string" ? record.status.toLowerCase() : undefined
  if (status !== undefined && ["aborted", "abort", "cancelled", "canceled", "error", "failed"].includes(status))
    return true
  const stopReason = typeof record.stopReason === "string" ? record.stopReason.toLowerCase() : undefined
  if (stopReason === "aborted" || stopReason === "error") return true
  if (record.type === "RUN_ERROR") return true
  const outcome = usageRecordResolve(record.outcome)
  if (outcome !== undefined && outcome.type !== undefined && outcome.type !== "success") return true
  return false
}

function usageCandidateResolve(record: UsageRecord): unknown {
  if (record.__codeline_reported_usage !== undefined) return record.__codeline_reported_usage
  if (record.usage !== undefined) return record.usage
  if (usageRecordResolve(record.response)?.usage !== undefined) return usageRecordResolve(record.response)?.usage
  if (usageRecordResolve(record.x_groq)?.usage !== undefined) return usageRecordResolve(record.x_groq)?.usage
  return record
}

export function compactionTokenUsageResolve(input: unknown): CompactionTokenUsage | undefined {
  const outer = usageRecordResolve(input)
  if (outer === undefined || usageStatusIsInvalid(outer)) return undefined
  const candidate = usageRecordResolve(usageCandidateResolve(outer))
  if (candidate === undefined || usageStatusIsInvalid(candidate)) return undefined

  const inputTokens = usageNumberResolve(candidate, ["inputTokens", "promptTokens", "input_tokens", "prompt_tokens"])
  const outputTokens = usageNumberResolve(candidate, [
    "outputTokens",
    "completionTokens",
    "output_tokens",
    "completion_tokens",
  ])
  const totalTokens = usageNumberResolve(candidate, ["totalTokens", "total_tokens"])
  if (inputTokens === null || outputTokens === null || totalTokens === null) return undefined

  const contextTokens = inputTokens ?? totalTokens
  if (contextTokens === undefined || contextTokens <= 0) return undefined
  return {
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...(totalTokens === undefined ? {} : { totalTokens }),
  }
}

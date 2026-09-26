import type { CompactionTokenUsage } from "./compactionTokenUsage.js"

export function compactionTokenUsageMetadataCreate(usage: CompactionTokenUsage): Record<string, unknown> {
  return { __codeline_reported_usage: usage }
}

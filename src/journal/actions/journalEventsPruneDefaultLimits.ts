export const journalEventsPruneDefaultLimits = {
  maxAgeMs: 12 * 60 * 60 * 1_000,
  maxCount: 500_000,
  maxSerializedBytes: 512 * 1024 * 1024,
} as const

export const sessionCacheDatabaseConfig = {
  limits: {
    maxAccountBytes: 32 * 1024 * 1024,
    maxAccounts: 3,
    maxDetailBytes: 4 * 1024 * 1024,
    maxDetailsPerSession: 100,
    maxHistoryEntriesPerSession: 250,
    maxHistoryEntryBytes: 64 * 1024,
    maxPageMetadataBytes: 16 * 1024,
    maxSessionsPerAccount: 50,
    maxSnapshotBytes: 128 * 1024,
  },
  name: "codeline-session-cache-v1",
  recordSchemaVersion: "session-cache.v1",
  version: 1,
} as const

export type SessionCacheLimits = {
  maxAccountBytes: number
  maxAccounts: number
  maxDetailBytes: number
  maxDetailsPerSession: number
  maxHistoryEntriesPerSession: number
  maxHistoryEntryBytes: number
  maxPageMetadataBytes: number
  maxSessionsPerAccount: number
  maxSnapshotBytes: number
}

import type { DBSchema } from "idb"
import type { SessionCacheHistoryEntryRecord } from "../schema/sessionCacheHistoryEntryRecordSchema.js"
import type { SessionCacheHistoryPageRecord } from "../schema/sessionCacheHistoryPageRecordSchema.js"
import type { SessionCacheRunDetailRecord } from "../schema/sessionCacheRunDetailRecordSchema.js"
import type { SessionCacheSnapshotRecord } from "../schema/sessionCacheSnapshotRecordSchema.js"
import type { SessionCacheToolDetailRecord } from "../schema/sessionCacheToolDetailRecordSchema.js"

export interface SessionCacheDatabaseSchema extends DBSchema {
  historyEntries: {
    key: [string, string, string]
    value: SessionCacheHistoryEntryRecord
    indexes: {
      "by-session": [string, string]
      "by-session-position": [string, string, number]
      "by-user-stored-at": [string, number]
    }
  }
  historyPages: {
    key: [string, string, string]
    value: SessionCacheHistoryPageRecord
    indexes: {
      "by-session": [string, string]
      "by-user-stored-at": [string, number]
    }
  }
  runDetails: {
    key: [string, string, string]
    value: SessionCacheRunDetailRecord
    indexes: {
      "by-session": [string, string]
      "by-user-stored-at": [string, number]
    }
  }
  sessionSnapshots: {
    key: [string, string]
    value: SessionCacheSnapshotRecord
    indexes: {
      "by-stored-at": number
      "by-user": string
      "by-user-stored-at": [string, number]
    }
  }
  toolDetails: {
    key: [string, string, string, string]
    value: SessionCacheToolDetailRecord
    indexes: {
      "by-run": [string, string, string]
      "by-session": [string, string]
      "by-user-stored-at": [string, number]
    }
  }
}

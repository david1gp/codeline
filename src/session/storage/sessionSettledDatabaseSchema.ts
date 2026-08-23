import type { DBSchema } from "idb"
import type { SessionSettledRecord } from "../schema/sessionSettledRecordSchema.js"

export interface SessionSettledDatabaseSchema extends DBSchema {
  settledSessions: {
    key: [string, string]
    value: SessionSettledRecord
    indexes: {
      "by-user": string
      "by-user-updated-at": [string, string]
    }
  }
}

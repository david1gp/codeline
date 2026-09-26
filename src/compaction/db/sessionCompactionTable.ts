import { sql } from "drizzle-orm"
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import { sessionTable } from "../../session/db/sessionTable.js"

export const sessionCompactionTable = sqliteTable(
  "session_compaction",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessionTable.id, { onDelete: "cascade" }),
    schemaVersion: integer("schema_version").notNull().default(1),
    compactionVersion: integer("compaction_version").notNull(),
    status: text("status").notNull(),
    sourceRevision: integer("source_revision").notNull(),
    coveredSequence: integer("covered_sequence").notNull(),
    summary: text("summary"),
    errorMessage: text("error_message"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("session_compaction_session_version_unique").on(table.sessionId, table.compactionVersion),
    uniqueIndex("session_compaction_session_running_unique")
      .on(table.sessionId)
      .where(sql`${table.status} = 'running'`),
    index("session_compaction_session_version_idx").on(table.sessionId, table.compactionVersion),
    check("session_compaction_schema_version_positive", sql`${table.schemaVersion} > 0`),
    check("session_compaction_version_positive", sql`${table.compactionVersion} > 0`),
    check("session_compaction_source_revision_positive", sql`${table.sourceRevision} > 0`),
    check("session_compaction_covered_sequence_non_negative", sql`${table.coveredSequence} >= 0`),
    check("session_compaction_status_allowed", sql`${table.status} IN ('running', 'succeeded', 'failed')`),
    check(
      "session_compaction_lifecycle_consistent",
      sql`(
        (${table.status} = 'running' AND ${table.summary} IS NULL AND ${table.errorMessage} IS NULL AND ${table.completedAt} IS NULL)
        OR (${table.status} = 'succeeded' AND ${table.summary} IS NOT NULL AND ${table.errorMessage} IS NULL AND ${table.completedAt} IS NOT NULL)
        OR (${table.status} = 'failed' AND ${table.summary} IS NULL AND ${table.errorMessage} IS NOT NULL AND ${table.completedAt} IS NOT NULL)
      )`,
    ),
  ],
)

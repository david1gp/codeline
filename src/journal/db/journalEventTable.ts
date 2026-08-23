import { sql } from "drizzle-orm"
import { check, index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core"
import { applicationUserTable } from "../../identity/db/applicationUserTable.js"
import type { JournalJsonValue } from "../schema/journalJsonValueSchema.js"

export const journalEventTable = sqliteTable(
  "journal_event",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => applicationUserTable.id, { onDelete: "cascade" }),
    sequence: integer("sequence", { mode: "number" }).notNull(),
    eventType: text("event_type").notNull(),
    payload: text("payload", { mode: "json" }).$type<JournalJsonValue>().notNull(),
    runId: text("run_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
    serializedBytes: integer("serialized_bytes", { mode: "number" }).notNull(),
  },
  (table) => [
    unique("journal_event_user_sequence_unique").on(table.userId, table.sequence),
    check("journal_event_sequence_positive", sql`${table.sequence} > 0`),
    check("journal_event_sequence_safe", sql`${table.sequence} <= 9007199254740991`),
    check("journal_event_serialized_bytes_positive", sql`${table.serializedBytes} > 0`),
    index("journal_event_user_sequence_idx").on(table.userId, table.sequence),
    index("journal_event_run_idx").on(table.runId),
    index("journal_event_created_idx").on(table.createdAt),
    index("journal_event_compact_retention_idx")
      .on(table.userId, table.createdAt, table.sequence, table.id)
      .where(
        sql`${table.eventType} in ('invalidate', 'run-completed', 'run-failed', 'run-cancelled', 'run-interrupted')`,
      ),
  ],
)

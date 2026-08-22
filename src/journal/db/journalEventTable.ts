import { sql } from "drizzle-orm"
import { bigint, check, index, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core"
import { applicationUserTable } from "../../identity/db/applicationUserTable.js"
import type { JournalJsonValue } from "../schema/journalJsonValueSchema.js"

export const journalEventTable = pgTable(
  "journal_event",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => applicationUserTable.id, { onDelete: "cascade" }),
    sequence: bigint("sequence", { mode: "number" }).notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<JournalJsonValue>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    serializedBytes: bigint("serialized_bytes", { mode: "number" })
      .notNull()
      .generatedAlwaysAs(sql`journal_event_serialized_bytes(id, user_id, sequence, event_type, payload, created_at)`),
  },
  (table) => [
    unique("journal_event_user_sequence_unique").on(table.userId, table.sequence),
    check("journal_event_sequence_positive", sql`${table.sequence} > 0`),
    check("journal_event_sequence_safe", sql`${table.sequence} <= 9007199254740991`),
    check("journal_event_serialized_bytes_positive", sql`${table.serializedBytes} > 0`),
    index("journal_event_user_sequence_idx").on(table.userId, table.sequence),
    index("journal_event_created_idx").on(table.createdAt),
    index("journal_event_compact_retention_idx")
      .on(table.userId, table.createdAt, table.sequence, table.id)
      .where(
        sql`${table.eventType} in ('invalidate', 'run-completed', 'run-failed', 'run-cancelled', 'run-interrupted')`,
      ),
  ],
)

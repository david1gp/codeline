import { sql } from "drizzle-orm"
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { applicationUserTable } from "../../identity/db/applicationUserTable.js"

export const journalSequenceCounterTable = sqliteTable(
  "journal_sequence_counter",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => applicationUserTable.id, { onDelete: "cascade" }),
    nextSequence: integer("next_sequence", { mode: "number" }).default(1).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
  },
  (table) => [
    check("journal_sequence_counter_next_sequence_positive", sql`${table.nextSequence} > 0`),
    check("journal_sequence_counter_next_sequence_safe", sql`${table.nextSequence} <= 9007199254740991`),
  ],
)

import { sql } from "drizzle-orm"
import { bigint, check, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { applicationUserTable } from "../../identity/db/applicationUserTable.js"

export const journalSequenceCounterTable = pgTable(
  "journal_sequence_counter",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => applicationUserTable.id, { onDelete: "cascade" }),
    nextSequence: bigint("next_sequence", { mode: "number" }).default(1).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("journal_sequence_counter_next_sequence_positive", sql`${table.nextSequence} > 0`),
    check("journal_sequence_counter_next_sequence_safe", sql`${table.nextSequence} <= 9007199254740991`),
  ],
)

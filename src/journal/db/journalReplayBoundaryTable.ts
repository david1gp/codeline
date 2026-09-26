import { sql } from "drizzle-orm"
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { applicationUserTable } from "../../identity/db/applicationUserTable.js"

export const journalReplayBoundaryTable = sqliteTable(
  "journal_replay_boundary",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => applicationUserTable.id, { onDelete: "cascade" }),
    prunedThroughSequence: integer("pruned_through_sequence", { mode: "number" }).default(0).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
  },
  (table) => [
    check("journal_replay_boundary_sequence_non_negative", sql`${table.prunedThroughSequence} >= 0`),
    check("journal_replay_boundary_sequence_safe", sql`${table.prunedThroughSequence} <= 9007199254740991`),
  ],
)

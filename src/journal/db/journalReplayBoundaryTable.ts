import { sql } from "drizzle-orm"
import { bigint, check, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { applicationUserTable } from "../../identity/db/applicationUserTable.js"

export const journalReplayBoundaryTable = pgTable(
  "journal_replay_boundary",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => applicationUserTable.id, { onDelete: "cascade" }),
    prunedThroughSequence: bigint("pruned_through_sequence", { mode: "number" }).default(0).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("journal_replay_boundary_sequence_non_negative", sql`${table.prunedThroughSequence} >= 0`),
    check("journal_replay_boundary_sequence_safe", sql`${table.prunedThroughSequence} <= 9007199254740991`),
  ],
)

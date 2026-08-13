import { sql } from "drizzle-orm"
import { bigint, check, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core"
import { sessionTable } from "../../session/db/sessionTable.js"

export const streamCheckpointTable = pgTable(
  "stream_checkpoint",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessionTable.id, { onDelete: "cascade" }),
    streamId: text("stream_id").notNull(),
    lastSequence: bigint("last_sequence", { mode: "number" }).notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("stream_checkpoint_session_stream_unique").on(table.sessionId, table.streamId),
    check("stream_checkpoint_sequence_nonnegative", sql`${table.lastSequence} >= 0`),
  ],
)

import { sql } from "drizzle-orm"
import { check, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core"
import { sessionTable } from "../../session/db/sessionTable.js"

export const streamCheckpointTable = sqliteTable(
  "stream_checkpoint",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessionTable.id, { onDelete: "cascade" }),
    streamId: text("stream_id").notNull(),
    lastSequence: integer("last_sequence", { mode: "number" }).notNull().default(0),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
  },
  (table) => [
    unique("stream_checkpoint_session_stream_unique").on(table.sessionId, table.streamId),
    check("stream_checkpoint_sequence_nonnegative", sql`${table.lastSequence} >= 0`),
  ],
)

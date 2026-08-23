import { sql } from "drizzle-orm"
import { check, index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core"
import { sessionTable } from "../../session/db/sessionTable.js"

export const streamEventTable = sqliteTable(
  "stream_event",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessionTable.id, { onDelete: "cascade" }),
    streamId: text("stream_id").notNull(),
    sequence: integer("sequence", { mode: "number" }).notNull(),
    eventType: text("event_type").notNull(),
    payload: text("payload", { mode: "json" }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
  },
  (table) => [
    unique("stream_event_stream_sequence_unique").on(table.streamId, table.sequence),
    unique("stream_event_idempotency_unique").on(table.streamId, table.idempotencyKey),
    check("stream_event_sequence_positive", sql`${table.sequence} > 0`),
    index("stream_event_session_stream_sequence_idx").on(table.sessionId, table.streamId, table.sequence),
    index("stream_event_created_idx").on(table.createdAt),
  ],
)

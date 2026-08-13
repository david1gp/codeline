import { sql } from "drizzle-orm"
import { bigint, check, index, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core"
import { sessionTable } from "../../session/db/sessionTable.js"

export const streamEventTable = pgTable(
  "stream_event",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessionTable.id, { onDelete: "cascade" }),
    streamId: text("stream_id").notNull(),
    sequence: bigint("sequence", { mode: "number" }).notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("stream_event_stream_sequence_unique").on(table.streamId, table.sequence),
    unique("stream_event_idempotency_unique").on(table.streamId, table.idempotencyKey),
    check("stream_event_sequence_positive", sql`${table.sequence} > 0`),
    index("stream_event_session_stream_sequence_idx").on(table.sessionId, table.streamId, table.sequence),
    index("stream_event_created_idx").on(table.createdAt),
  ],
)

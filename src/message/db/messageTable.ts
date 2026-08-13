import { sql } from "drizzle-orm"
import { check, index, integer, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core"
import { agentTable } from "../../agents/db/agentTable.js"
import { sessionTable } from "../../session/db/sessionTable.js"

export const messageTable = pgTable(
  "message",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessionTable.id, { onDelete: "cascade" }),
    agentId: text("agent_id")
      .notNull()
      .references(() => agentTable.id, { onDelete: "restrict" }),
    role: text("role").notNull(),
    sequence: integer("sequence").notNull(),
    content: text("content").notNull(),
    clientRequestId: text("client_request_id").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("message_session_sequence_unique").on(table.sessionId, table.sequence),
    unique("message_session_client_request_unique").on(table.sessionId, table.clientRequestId),
    check("message_sequence_positive", sql`${table.sequence} > 0`),
    check("message_role_allowed", sql`${table.role} in ('user', 'assistant')`),
    index("message_session_sequence_idx").on(table.sessionId, table.sequence),
    index("message_role_idx").on(table.role),
  ],
)

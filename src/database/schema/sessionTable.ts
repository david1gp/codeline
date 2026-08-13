import { foreignKey, index, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core"
import { agentTable } from "./agentTable.js"
import { developmentUserTable } from "./developmentUserTable.js"
import { serverTable } from "./serverTable.js"

export const sessionTable = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => developmentUserTable.id, { onDelete: "cascade" }),
    serverId: text("server_id")
      .notNull()
      .references(() => serverTable.id, { onDelete: "restrict" }),
    primaryAgentId: text("primary_agent_id")
      .notNull()
      .references(() => agentTable.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    clientRequestId: text("client_request_id").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("session_user_client_request_unique").on(table.userId, table.clientRequestId),
    foreignKey({
      name: "session_server_primary_agent_consistency_fk",
      columns: [table.serverId, table.primaryAgentId],
      foreignColumns: [agentTable.serverId, agentTable.id],
    }).onDelete("restrict"),
    index("session_user_updated_idx").on(table.userId, table.updatedAt),
    index("session_user_archived_idx").on(table.userId, table.archivedAt),
    index("session_server_idx").on(table.serverId),
  ],
)

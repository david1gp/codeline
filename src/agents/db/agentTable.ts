import { sql } from "drizzle-orm"
import { type AnySQLiteColumn, check, index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core"
import { serverTable } from "../../servers/db/serverTable.js"

export const agentTable = sqliteTable(
  "agent",
  {
    id: text("id").primaryKey(),
    serverId: text("server_id")
      .notNull()
      .references(() => serverTable.id, { onDelete: "cascade" }),
    parentAgentId: text("parent_agent_id").references((): AnySQLiteColumn => agentTable.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    role: text("role").notNull(),
    configuration: text("configuration", { mode: "json" }).notNull().default({}),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
  },
  (table) => [
    unique("agent_server_name_unique").on(table.serverId, table.name),
    unique("agent_server_id_unique").on(table.serverId, table.id),
    check("agent_sort_order_nonnegative", sql`${table.sortOrder} >= 0`),
    index("agent_server_idx").on(table.serverId),
    index("agent_parent_idx").on(table.parentAgentId),
  ],
)

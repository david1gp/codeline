import { sql } from "drizzle-orm"
import { check, index, integer, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core"
import type { AnyPgColumn } from "drizzle-orm/pg-core"
import { serverTable } from "./serverTable.js"

export const agentTable = pgTable(
  "agent",
  {
    id: text("id").primaryKey(),
    serverId: text("server_id")
      .notNull()
      .references(() => serverTable.id, { onDelete: "cascade" }),
    parentAgentId: text("parent_agent_id").references((): AnyPgColumn => agentTable.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    role: text("role").notNull(),
    configuration: jsonb("configuration").notNull().default({}),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("agent_server_name_unique").on(table.serverId, table.name),
    unique("agent_server_id_unique").on(table.serverId, table.id),
    check("agent_sort_order_nonnegative", sql`${table.sortOrder} >= 0`),
    index("agent_server_idx").on(table.serverId),
    index("agent_parent_idx").on(table.parentAgentId),
  ],
)

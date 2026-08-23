import { index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core"
import { organizationTable } from "../../identity/db/organizationTable.js"

export const serverTable = sqliteTable(
  "server",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    endpoint: text("endpoint").notNull(),
    metadata: text("metadata", { mode: "json" }).notNull().default({}),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
  },
  (table) => [
    unique("server_organization_name_unique").on(table.organizationId, table.name),
    index("server_organization_idx").on(table.organizationId),
    index("server_name_idx").on(table.name),
    index("server_metadata_gin_idx").on(table.metadata),
  ],
)

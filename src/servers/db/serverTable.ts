import { index, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core"
import { organizationTable } from "../../identity/db/organizationTable.js"

export const serverTable = pgTable(
  "server",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    endpoint: text("endpoint").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("server_organization_name_unique").on(table.organizationId, table.name),
    index("server_organization_idx").on(table.organizationId),
    index("server_name_idx").on(table.name),
    index("server_metadata_gin_idx").using("gin", table.metadata),
  ],
)

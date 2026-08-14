import { index, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core"
import { applicationUserTable } from "../../identity/db/applicationUserTable.js"

export const serverTable = pgTable(
  "server",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => applicationUserTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    endpoint: text("endpoint").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("server_owner_name_unique").on(table.ownerUserId, table.name),
    index("server_owner_idx").on(table.ownerUserId),
    index("server_name_idx").on(table.name),
    index("server_metadata_gin_idx").using("gin", table.metadata),
  ],
)

import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core"

export const organizationTable = sqliteTable(
  "identity_organization",
  {
    id: text("id").primaryKey(),
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
  },
  (table) => [unique("organization_external_id_unique").on(table.externalId)],
)

export type Organization = typeof organizationTable.$inferSelect

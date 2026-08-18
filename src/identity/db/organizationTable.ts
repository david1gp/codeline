import { pgTable, text, timestamp, unique } from "drizzle-orm/pg-core"

export const organizationTable = pgTable(
  "organization",
  {
    id: text("id").primaryKey(),
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique("organization_external_id_unique").on(table.externalId)],
)

export type Organization = typeof organizationTable.$inferSelect

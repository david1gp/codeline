import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core"

export const applicationUserTable = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    displayName: text("display_name").notNull(),
    email: text("email"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("user_display_name_idx").on(table.displayName)],
)

export type ApplicationUser = typeof applicationUserTable.$inferSelect

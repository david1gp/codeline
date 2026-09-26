import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const applicationUserTable = sqliteTable(
  "identity_user",
  {
    id: text("id").primaryKey(),
    displayName: text("display_name").notNull(),
    email: text("email"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
  },
  (table) => [index("user_display_name_idx").on(table.displayName)],
)

export type ApplicationUser = typeof applicationUserTable.$inferSelect

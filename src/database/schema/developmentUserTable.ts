import { index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core"

export const developmentUserTable = pgTable(
  "development_user",
  {
    id: text("id").primaryKey(),
    identityKey: text("identity_key").notNull(),
    displayName: text("display_name").notNull(),
    email: text("email"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("development_user_identity_key_unique").on(table.identityKey),
    index("development_user_display_name_idx").on(table.displayName),
  ],
)

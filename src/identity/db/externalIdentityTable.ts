import { index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core"
import { applicationUserTable } from "./applicationUserTable.js"

export const externalIdentityTable = sqliteTable(
  "identity_external_identity",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => applicationUserTable.id, { onDelete: "cascade" }),
    issuer: text("issuer").notNull(),
    subject: text("subject").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
  },
  (table) => [
    unique("external_identity_issuer_subject_unique").on(table.issuer, table.subject),
    unique("external_identity_user_issuer_unique").on(table.userId, table.issuer),
    index("external_identity_user_idx").on(table.userId),
  ],
)

import { index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core"
import { applicationUserTable } from "../../identity/db/applicationUserTable.js"

export const projectTable = sqliteTable(
  "project",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => applicationUserTable.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    displayName: text("display_name"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
  },
  (table) => [
    unique("project_user_path_unique").on(table.userId, table.path),
    index("project_user_updated_idx").on(table.userId, table.updatedAt),
  ],
)

export type Project = typeof projectTable.$inferSelect

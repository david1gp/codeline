import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { applicationUserTable } from "../../identity/db/applicationUserTable.js"

export const noteTable = sqliteTable(
  "note",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => applicationUserTable.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    projectPath: text("project_path"),
    sortOrder: integer("sort_order"),
    revision: integer("revision").default(1).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
  },
  (table) => [
    index("note_user_updated_idx").on(table.userId, table.updatedAt, table.id),
    index("note_user_project_idx").on(table.userId, table.projectPath),
  ],
)

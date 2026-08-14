import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { applicationUserTable } from "../../identity/db/applicationUserTable.js"

export const noteTable = pgTable(
  "note",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => applicationUserTable.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    projectPath: text("project_path"),
    sortOrder: integer("sort_order"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("note_user_updated_idx").on(table.userId, table.updatedAt, table.id),
    index("note_user_project_idx").on(table.userId, table.projectPath),
  ],
)

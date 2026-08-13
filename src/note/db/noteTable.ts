import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { developmentUserTable } from "../../identity/db/developmentUserTable.js"

export const noteTable = pgTable(
  "note",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => developmentUserTable.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    projectPath: text("project_path"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("note_user_updated_idx").on(table.userId, table.updatedAt, table.id),
    index("note_user_project_idx").on(table.userId, table.projectPath),
  ],
)

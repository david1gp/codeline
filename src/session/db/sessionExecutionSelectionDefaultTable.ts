import { index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core"
import { applicationUserTable } from "../../identity/db/applicationUserTable.js"
import type { SessionExecutionSelection } from "../schema/sessionExecutionSelectionSchema.js"

export const sessionExecutionSelectionDefaultTable = sqliteTable(
  "session_execution_selection_default",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => applicationUserTable.id, { onDelete: "cascade" }),
    projectPath: text("project_path").notNull(),
    executionSelection: text("execution_selection", { mode: "json" }).$type<SessionExecutionSelection>().notNull(),
    revision: integer("revision").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
  },
  (table) => [
    unique("session_execution_selection_default_user_project_unique").on(table.userId, table.projectPath),
    index("session_execution_selection_default_user_project_idx").on(table.userId, table.projectPath),
  ],
)

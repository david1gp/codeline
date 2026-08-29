import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const projectFolderAssignmentBackfillTable = sqliteTable("project_folder_assignment_backfill", {
  id: text("id").primaryKey(),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
})

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const projectRegistrySessionPathBackfillTable = sqliteTable("project_registry_session_path_backfill", {
  id: text("id").primaryKey(),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
})

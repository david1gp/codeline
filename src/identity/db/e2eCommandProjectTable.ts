import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { e2eFixtureRunTable } from "./e2eFixtureRunTable.js"

export const e2eCommandProjectTable = sqliteTable("e2e_command_project", {
  runId: text("run_id")
    .primaryKey()
    .references(() => e2eFixtureRunTable.runId, { onDelete: "restrict" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  path: text("path").notNull().unique(),
  manifest: text("manifest", { mode: "json" }).$type<Record<string, string>>().notNull(),
})

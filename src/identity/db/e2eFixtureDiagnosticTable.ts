import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { e2eFixtureRunTable } from "./e2eFixtureRunTable.js"

export const e2eFixtureDiagnosticTable = sqliteTable(
  "e2e_fixture_diagnostic",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: text("run_id")
      .notNull()
      .references(() => e2eFixtureRunTable.runId, { onDelete: "restrict" }),
    userId: text("user_id").notNull(),
    entry: text("entry", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  },
  (table) => [index("e2e_fixture_diagnostic_run_id_idx").on(table.runId, table.id)],
)

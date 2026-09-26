import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { e2eFixtureRunTable } from "./e2eFixtureRunTable.js"

// A source-to-clone manifest, not a prefix-based deletion permission.
export const e2eSampleSessionsTable = sqliteTable("e2e_sample_sessions", {
  runId: text("run_id")
    .primaryKey()
    .references(() => e2eFixtureRunTable.runId, { onDelete: "restrict" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  userId: text("user_id").notNull(),
  issuer: text("issuer").notNull(),
  organizationId: text("organization_id").notNull(),
  mapping: text("mapping", { mode: "json" }).$type<Record<string, string>>().notNull(),
})

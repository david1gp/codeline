import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

// Only the fixture API writes this marker. A subject prefix alone never grants ownership.
export const e2eFixtureRunTable = sqliteTable("e2e_fixture_run", {
  runId: text("run_id").primaryKey(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  issuer: text("issuer").notNull(),
  organizationId: text("organization_id").notNull(),
  organizationExternalId: text("organization_external_id").notNull(),
  firstUserId: text("first_user_id").notNull(),
  secondUserId: text("second_user_id").notNull(),
})

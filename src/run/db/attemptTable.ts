import { sql } from "drizzle-orm"
import { check, foreignKey, index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core"
import { applicationUserTable } from "../../identity/db/applicationUserTable.js"
import type { RunBudget } from "../schema/runBudgetSchema.js"
import type { RunExecutionSnapshot } from "../schema/runExecutionSnapshotSchema.js"
import type { RunFailureMetadata } from "../schema/runFailureMetadataSchema.js"
import { runTable } from "./runTable.js"

export const attemptTable = sqliteTable(
  "attempt",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => applicationUserTable.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    streamId: text("stream_id").notNull(),
    status: text("status").notNull().default("accepted"),
    snapshot: text("snapshot", { mode: "json" }).$type<RunExecutionSnapshot>().notNull(),
    budget: text("budget", { mode: "json" }).$type<RunBudget>().notNull(),
    failure: text("failure", { mode: "json" }).$type<RunFailureMetadata | null>(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
  },
  (table) => [
    unique("attempt_run_ordinal_unique").on(table.runId, table.ordinal),
    unique("attempt_stream_id_unique").on(table.streamId),
    unique("attempt_user_session_run_id_unique").on(table.userId, table.sessionId, table.runId, table.id),
    foreignKey({
      name: "attempt_run_ownership_consistency_fk",
      columns: [table.userId, table.sessionId, table.runId],
      foreignColumns: [runTable.userId, runTable.sessionId, runTable.id],
    }).onDelete("cascade"),
    check("attempt_status_allowed", sql`${table.status} IN ('accepted', 'running', 'succeeded', 'failed', 'aborted')`),
    check("attempt_ordinal_positive", sql`${table.ordinal} > 0`),
    check("attempt_stream_id_bounded", sql`length(${table.streamId}) BETWEEN 1 AND 200`),
    index("attempt_session_updated_idx").on(table.sessionId, table.updatedAt, table.id),
    index("attempt_run_idx").on(table.runId, table.ordinal),
    index("attempt_stream_idx").on(table.streamId),
  ],
)

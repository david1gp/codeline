import { sql } from "drizzle-orm"
import { check, foreignKey, index, integer, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core"
import { developmentUserTable } from "../../identity/db/developmentUserTable.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import type { RunBudget } from "../schema/runBudgetSchema.js"
import type { RunExecutionSnapshot } from "../schema/runExecutionSnapshotSchema.js"
import type { RunFailureMetadata } from "../schema/runFailureMetadataSchema.js"
import { runTable } from "./runTable.js"

export const attemptTable = pgTable(
  "attempt",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => developmentUserTable.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    streamId: text("stream_id").notNull(),
    status: text("status").notNull().default("accepted"),
    snapshot: jsonb("snapshot").$type<RunExecutionSnapshot>().notNull(),
    budget: jsonb("budget").$type<RunBudget>().notNull(),
    failure: jsonb("failure").$type<RunFailureMetadata | null>(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
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
    check("attempt_stream_id_bounded", sql`char_length(${table.streamId}) BETWEEN 1 AND 200`),
    index("attempt_session_updated_idx").on(table.sessionId, table.updatedAt, table.id),
    index("attempt_run_idx").on(table.runId, table.ordinal),
    index("attempt_stream_idx").on(table.streamId),
  ],
)

import { sql } from "drizzle-orm"
import { check, foreignKey, index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core"
import { applicationUserTable } from "../../identity/db/applicationUserTable.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import type { RunBudget } from "../schema/runBudgetSchema.js"
import type { RunCancellationKind } from "../schema/runCancellationKindSchema.js"
import type { RunExecutionSnapshot } from "../schema/runExecutionSnapshotSchema.js"
import type { RunFailureMetadata } from "../schema/runFailureMetadataSchema.js"

export const runTable = sqliteTable(
  "run",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => applicationUserTable.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    clientRunId: text("client_run_id").notNull(),
    streamId: text("stream_id").notNull(),
    status: text("status").notNull().default("accepted"),
    snapshot: text("snapshot", { mode: "json" }).$type<RunExecutionSnapshot>().notNull(),
    budget: text("budget", { mode: "json" }).$type<RunBudget>().notNull(),
    deadlineAt: integer("deadline_at", { mode: "timestamp_ms" }).notNull(),
    failure: text("failure", { mode: "json" }).$type<RunFailureMetadata | null>(),
    cancellationRequestedAt: integer("cancellation_requested_at", { mode: "timestamp_ms" }),
    cancellationKind: text("cancellation_kind").$type<RunCancellationKind | null>(),
    cancellationSourceRunId: text("cancellation_source_run_id"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
  },
  (table) => [
    unique("run_session_client_run_unique").on(table.sessionId, table.clientRunId),
    unique("run_stream_id_unique").on(table.streamId),
    unique("run_user_session_id_unique").on(table.userId, table.sessionId, table.id),
    foreignKey({
      name: "run_user_session_consistency_fk",
      columns: [table.userId, table.sessionId],
      foreignColumns: [sessionTable.userId, sessionTable.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "run_cancellation_source_ownership_fk",
      columns: [table.userId, table.sessionId, table.cancellationSourceRunId],
      foreignColumns: [table.userId, table.sessionId, table.id],
    }),
    check("run_status_allowed", sql`${table.status} IN ('accepted', 'running', 'succeeded', 'failed', 'aborted')`),
    check(
      "run_cancellation_fields_allowed",
      sql`(
        (${table.cancellationKind} IS NULL AND ${table.cancellationRequestedAt} IS NULL AND ${table.cancellationSourceRunId} IS NULL)
        OR (${table.cancellationKind} = 'requested' AND ${table.cancellationRequestedAt} IS NOT NULL AND ${table.cancellationSourceRunId} IS NULL)
        OR (${table.cancellationKind} = 'ancestor' AND ${table.cancellationRequestedAt} IS NOT NULL AND ${table.cancellationSourceRunId} IS NOT NULL)
      )`,
    ),
    check("run_client_run_id_bounded", sql`length(${table.clientRunId}) BETWEEN 1 AND 200`),
    check("run_stream_id_bounded", sql`length(${table.streamId}) BETWEEN 1 AND 200`),
    index("run_user_updated_idx").on(table.userId, table.updatedAt, table.id),
    index("run_session_updated_idx").on(table.sessionId, table.updatedAt, table.id),
    index("run_stream_idx").on(table.streamId),
  ],
)

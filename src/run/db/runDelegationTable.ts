import { sql } from "drizzle-orm"
import { check, foreignKey, index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core"
import { applicationUserTable } from "../../identity/db/applicationUserTable.js"
import type { RunDelegationResult } from "../schema/runDelegationResultSchema.js"
import { attemptTable } from "./attemptTable.js"
import { runTable } from "./runTable.js"

export const runDelegationTable = sqliteTable(
  "run_delegation",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => applicationUserTable.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    childRunId: text("child_run_id").notNull(),
    rootRunId: text("root_run_id").notNull(),
    parentRunId: text("parent_run_id").notNull(),
    parentAttemptId: text("parent_attempt_id").notNull(),
    delegationKey: text("delegation_key").notNull(),
    rootOrdinal: integer("root_ordinal").notNull(),
    depth: integer("depth").notNull(),
    task: text("task").notNull(),
    finalizedResult: text("finalized_result", { mode: "json" }).$type<RunDelegationResult | null>(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
  },
  (table) => [
    unique("run_delegation_child_run_unique").on(table.childRunId),
    unique("run_delegation_parent_key_unique").on(table.parentRunId, table.parentAttemptId, table.delegationKey),
    unique("run_delegation_root_ordinal_unique").on(table.rootRunId, table.rootOrdinal),
    foreignKey({
      name: "run_delegation_child_ownership_consistency_fk",
      columns: [table.userId, table.sessionId, table.childRunId],
      foreignColumns: [runTable.userId, runTable.sessionId, runTable.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "run_delegation_root_ownership_consistency_fk",
      columns: [table.userId, table.sessionId, table.rootRunId],
      foreignColumns: [runTable.userId, runTable.sessionId, runTable.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "run_delegation_parent_ownership_consistency_fk",
      columns: [table.userId, table.sessionId, table.parentRunId],
      foreignColumns: [runTable.userId, runTable.sessionId, runTable.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "run_delegation_parent_attempt_consistency_fk",
      columns: [table.userId, table.sessionId, table.parentRunId, table.parentAttemptId],
      foreignColumns: [attemptTable.userId, attemptTable.sessionId, attemptTable.runId, attemptTable.id],
    }).onDelete("cascade"),
    check("run_delegation_key_bounded", sql`length(${table.delegationKey}) BETWEEN 1 AND 200`),
    check("run_delegation_root_ordinal_positive", sql`${table.rootOrdinal} > 0`),
    check("run_delegation_depth_bounded", sql`${table.depth} BETWEEN 1 AND 3`),
    check("run_delegation_task_bounded", sql`length(${table.task}) BETWEEN 1 AND 100000`),
    index("run_delegation_user_updated_idx").on(table.userId, table.updatedAt, table.id),
    index("run_delegation_session_updated_idx").on(table.sessionId, table.updatedAt, table.id),
    index("run_delegation_root_idx").on(table.rootRunId, table.rootOrdinal),
    index("run_delegation_parent_idx").on(table.parentRunId, table.parentAttemptId),
  ],
)

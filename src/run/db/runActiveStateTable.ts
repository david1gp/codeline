import { sql } from "drizzle-orm"
import { check, foreignKey, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { applicationUserTable } from "../../identity/db/applicationUserTable.js"
import type { RunFailureMetadata } from "../schema/runFailureMetadataSchema.js"
import { runTable } from "./runTable.js"

export const runActiveStateTable = sqliteTable(
  "run_active_state",
  {
    runId: text("run_id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => applicationUserTable.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    status: text("status").notNull(),
    lastSequence: integer("last_sequence").notNull().default(0),
    partialText: text("partial_text").notNull().default(""),
    failure: text("failure", { mode: "json" }).$type<RunFailureMetadata | null>(),
    changePosition: integer("change_position").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "run_active_state_user_session_run_consistency_fk",
      columns: [table.userId, table.sessionId, table.runId],
      foreignColumns: [runTable.userId, runTable.sessionId, runTable.id],
    }).onDelete("cascade"),
    check("run_active_state_status_allowed", sql`${table.status} IN ('accepted', 'running')`),
    check("run_active_state_last_sequence_non_negative", sql`${table.lastSequence} >= 0`),
    check("run_active_state_last_sequence_safe", sql`${table.lastSequence} <= 9007199254740991`),
    check("run_active_state_partial_text_bounded", sql`length(${table.partialText}) <= 16384`),
    check("run_active_state_change_position_positive", sql`${table.changePosition} > 0`),
    check("run_active_state_change_position_safe", sql`${table.changePosition} <= 9007199254740991`),
    index("run_active_state_session_change_position_idx").on(table.sessionId, table.changePosition, table.runId),
    index("run_active_state_user_session_idx").on(table.userId, table.sessionId, table.runId),
  ],
)

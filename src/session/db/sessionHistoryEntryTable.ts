import { sql } from "drizzle-orm"
import { check, foreignKey, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import { applicationUserTable } from "../../identity/db/applicationUserTable.js"
import type { JournalJsonValue } from "../../journal/schema/journalJsonValueSchema.js"
import { sessionTable } from "./sessionTable.js"

export const sessionHistoryEntryTable = sqliteTable(
  "session_history_entry",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => applicationUserTable.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    kind: text("kind").notNull(),
    messageRole: text("message_role"),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    sourceDetailId: text("source_detail_id").notNull().default(""),
    position: integer("position").notNull(),
    changePosition: integer("change_position").notNull(),
    payload: text("payload", { mode: "json" }).$type<JournalJsonValue>().notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "session_history_entry_user_session_consistency_fk",
      columns: [table.userId, table.sessionId],
      foreignColumns: [sessionTable.userId, sessionTable.id],
    }).onDelete("cascade"),
    uniqueIndex("session_history_entry_session_source_unique").on(
      table.sessionId,
      table.sourceType,
      table.sourceId,
      table.sourceDetailId,
    ),
    uniqueIndex("session_history_entry_session_position_unique").on(table.sessionId, table.position),
    index("session_history_entry_session_change_position_idx").on(table.sessionId, table.changePosition),
    index("session_history_entry_session_kind_message_role_position_idx").on(
      table.sessionId,
      table.kind,
      table.messageRole,
      table.position,
    ),
    check("session_history_entry_kind_allowed", sql`${table.kind} IN ('message', 'run', 'tool')`),
    check("session_history_entry_source_type_allowed", sql`${table.sourceType} IN ('message', 'run', 'tool')`),
    check("session_history_entry_source_id_bounded", sql`length(${table.sourceId}) BETWEEN 1 AND 256`),
    check(
      "session_history_entry_source_detail_id_bounded",
      sql`${table.sourceDetailId} = '' OR length(${table.sourceDetailId}) BETWEEN 1 AND 256`,
    ),
    check("session_history_entry_position_positive", sql`${table.position} > 0`),
    check("session_history_entry_position_safe", sql`${table.position} <= 9007199254740991`),
    check("session_history_entry_change_position_positive", sql`${table.changePosition} > 0`),
    check("session_history_entry_change_position_safe", sql`${table.changePosition} <= 9007199254740991`),
    check("session_history_entry_change_position_ordered", sql`${table.changePosition} >= ${table.position}`),
  ],
)

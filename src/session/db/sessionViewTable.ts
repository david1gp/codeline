import { foreignKey, index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { applicationUserTable } from "../../identity/db/applicationUserTable.js"
import { sessionTable } from "./sessionTable.js"

export const sessionViewTable = sqliteTable(
  "session_view",
  {
    userId: text("user_id")
      .notNull()
      .references(() => applicationUserTable.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    acknowledgedFinishedAt: integer("acknowledged_finished_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.sessionId], name: "session_view_pkey" }),
    foreignKey({
      name: "session_view_user_session_consistency_fk",
      columns: [table.userId, table.sessionId],
      foreignColumns: [sessionTable.userId, sessionTable.id],
    }).onDelete("cascade"),
    index("session_view_session_idx").on(table.sessionId),
  ],
)

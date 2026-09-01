import { sql } from "drizzle-orm"
import { check, foreignKey, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { applicationUserTable } from "../../identity/db/applicationUserTable.js"
import type { RunToolDetail } from "../api/runToolDetailSchema.js"
import type { RunTranscript } from "../api/runTranscriptSchema.js"
import { runTable } from "./runTable.js"

export const runFinalizedDetailTable = sqliteTable(
  "run_finalized_detail",
  {
    runId: text("run_id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => applicationUserTable.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    transcript: text("transcript", { mode: "json" }).$type<RunTranscript>().notNull(),
    tools: text("tools", { mode: "json" }).$type<RunToolDetail[]>().notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "run_finalized_detail_user_session_run_consistency_fk",
      columns: [table.userId, table.sessionId, table.runId],
      foreignColumns: [runTable.userId, runTable.sessionId, runTable.id],
    }).onDelete("cascade"),
    check("run_finalized_detail_transcript_json", sql`json_valid(${table.transcript})`),
    check("run_finalized_detail_tools_json", sql`json_valid(${table.tools})`),
    index("run_finalized_detail_session_idx").on(table.userId, table.sessionId, table.runId),
  ],
)

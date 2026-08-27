import { type AnySQLiteColumn, foreignKey, index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core"
import { agentTable } from "../../agents/db/agentTable.js"
import { applicationUserTable } from "../../identity/db/applicationUserTable.js"
import type { AgentInstructionsResolvedSnapshot } from "../../instructions/schema/agentInstructionsResolvedSnapshotSchema.js"
import type { RunExecutionManifest } from "../../run/schema/runExecutionManifestSchema.js"
import { serverTable } from "../../servers/db/serverTable.js"
import type { SkillSelection } from "../../skills/schema/skillSelectionSchema.js"
import type { SessionExecutionSelection } from "../schema/sessionExecutionSelectionSchema.js"
import type { SessionMetadata } from "../schema/sessionMetadataSchema.js"

export const sessionTable = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => applicationUserTable.id, { onDelete: "cascade" }),
    serverId: text("server_id")
      .notNull()
      .references(() => serverTable.id, { onDelete: "restrict" }),
    primaryAgentId: text("primary_agent_id")
      .notNull()
      .references(() => agentTable.id, { onDelete: "restrict" }),
    projectPath: text("project_path").notNull().default("~"),
    parentSessionId: text("parent_session_id").references((): AnySQLiteColumn => sessionTable.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    clientRequestId: text("client_request_id").notNull(),
    executionSelection: text("execution_selection", { mode: "json" }).$type<SessionExecutionSelection | null>(),
    skillSelection: text("skill_selection", { mode: "json" })
      .$type<SkillSelection>()
      .notNull()
      .default({
        activeSkills: [],
        excludedSkillNames: [],
        missingFolderPaths: [],
        missingSkillNames: [],
        presetName: "default",
        userOverride: { disabledSkills: [], enabledSkills: [] },
        version: 1,
      }),
    executionManifest: text("execution_manifest", { mode: "json" }).$type<RunExecutionManifest | null>(),
    instructionSnapshot: text("instruction_snapshot", { mode: "json" })
      .$type<AgentInstructionsResolvedSnapshot>()
      .notNull()
      .default({ snapshots: [], version: 1 }),
    metadata: text("metadata", { mode: "json" }).$type<SessionMetadata>().notNull().default({}),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(true),
    revision: integer("revision").notNull().default(1),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
  },
  (table) => [
    unique("session_user_client_request_unique").on(table.userId, table.clientRequestId),
    unique("session_user_id_unique").on(table.userId, table.id),
    foreignKey({
      name: "session_server_primary_agent_consistency_fk",
      columns: [table.serverId, table.primaryAgentId],
      foreignColumns: [agentTable.serverId, agentTable.id],
    }).onDelete("restrict"),
    index("session_user_updated_idx").on(table.userId, table.updatedAt),
    index("session_user_archived_idx").on(table.userId, table.archivedAt),
    index("session_server_idx").on(table.serverId),
    index("session_parent_idx").on(table.parentSessionId),
  ],
)

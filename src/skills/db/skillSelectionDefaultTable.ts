import { index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core"
import { applicationUserTable } from "../../identity/db/applicationUserTable.js"
import type { SkillSelectionOverride } from "../schema/skillSelectionOverrideSchema.js"

export const skillSelectionDefaultTable = sqliteTable(
  "skill_selection_default",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => applicationUserTable.id, { onDelete: "cascade" }),
    projectPath: text("project_path").notNull(),
    presetName: text("preset_name").notNull().default("default"),
    selectionOverride: text("selection_override", { mode: "json" })
      .$type<SkillSelectionOverride>()
      .notNull()
      .default({ disabledSkills: [], enabledSkills: [] }),
    revision: integer("revision").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
  },
  (table) => [
    unique("skill_selection_default_user_project_unique").on(table.userId, table.projectPath),
    index("skill_selection_default_user_project_idx").on(table.userId, table.projectPath),
  ],
)

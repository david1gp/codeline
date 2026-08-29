import { foreignKey, index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core"
import { applicationUserTable } from "../../identity/db/applicationUserTable.js"
import type { ProjectFolderId } from "../projectFolderIdSchema.js"
import { projectFolderTable } from "./projectFolderTable.js"

export const projectTable = sqliteTable(
  "project",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => applicationUserTable.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    displayName: text("display_name"),
    parentFolderId: text("parent_folder_id")
      .$type<ProjectFolderId | null>()
      .references(() => projectFolderTable.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
  },
  (table) => [
    unique("project_user_path_unique").on(table.userId, table.path),
    index("project_user_updated_idx").on(table.userId, table.updatedAt),
    index("project_user_parent_folder_idx").on(table.userId, table.parentFolderId),
    foreignKey({
      name: "project_parent_folder_ownership_fk",
      columns: [table.userId, table.parentFolderId],
      foreignColumns: [projectFolderTable.userId, projectFolderTable.id],
    }).onDelete("no action"),
  ],
)

export type Project = typeof projectTable.$inferSelect

import { sql } from "drizzle-orm"
import { check, index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core"
import { applicationUserTable } from "../../identity/db/applicationUserTable.js"
import type { ProjectFolderBootstrapKey } from "../projectFolderBootstrapKeySchema.js"
import type { ProjectFolderId } from "../projectFolderIdSchema.js"

export const projectFolderTable = sqliteTable(
  "project_folder",
  {
    id: text("id").$type<ProjectFolderId>().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => applicationUserTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    bootstrapKey: text("bootstrap_key").$type<ProjectFolderBootstrapKey | null>(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
  },
  (table) => [
    unique("project_folder_user_name_unique").on(table.userId, table.name),
    unique("project_folder_user_bootstrap_unique").on(table.userId, table.bootstrapKey),
    unique("project_folder_user_id_unique").on(table.userId, table.id),
    index("project_folder_user_updated_idx").on(table.userId, table.updatedAt),
    check(
      "project_folder_bootstrap_key_allowed",
      sql`${table.bootstrapKey} IS NULL OR ${table.bootstrapKey} IN ('adaptive', 'leo', 'personal')`,
    ),
  ],
)

export type ProjectFolder = typeof projectFolderTable.$inferSelect

import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import type { ProjectFolderId } from "../projectFolderIdSchema.js"
import { projectFolderTable, type ProjectFolder } from "./projectFolderTable.js"

export async function projectFolderRepositoryDelete(
  database: DatabaseExecutor,
  userId: string,
  folderId: ProjectFolderId,
): Promise<Result<ProjectFolder>> {
  const op = "projectFolderRepositoryDelete"

  try {
    const [folder] = await database
      .delete(projectFolderTable)
      .where(and(eq(projectFolderTable.id, folderId), eq(projectFolderTable.userId, userId)))
      .returning()
    if (folder === undefined) return createResultError(op, "The project folder could not be found.")
    return createResult(folder)
  } catch (_error) {
    return createResultError(op, "The project folder could not be deleted.")
  }
}

import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { asc, desc, eq } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { projectFolderTable, type ProjectFolder } from "./projectFolderTable.js"

export async function projectFolderRepositoryList(
  database: DatabaseExecutor,
  userId: string,
): Promise<Result<ProjectFolder[]>> {
  const op = "projectFolderRepositoryList"

  try {
    const folders = await database
      .select()
      .from(projectFolderTable)
      .where(eq(projectFolderTable.userId, userId))
      .orderBy(desc(projectFolderTable.updatedAt), asc(projectFolderTable.name), asc(projectFolderTable.id))
    return createResult(folders)
  } catch (_error) {
    return createResultError(op, "The project folders could not be loaded.")
  }
}

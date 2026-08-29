import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import type { ProjectFolderId } from "../projectFolderIdSchema.js"
import { projectFolderTable } from "./projectFolderTable.js"

export async function projectFolderResolve(
  database: DatabaseExecutor,
  userId: string,
  folderId: ProjectFolderId | null,
): Promise<Result<{ id: ProjectFolderId; label: string } | null>> {
  const op = "projectFolderResolve"
  if (folderId === null) return createResult(null)

  try {
    const [folder] = await database
      .select({ id: projectFolderTable.id, label: projectFolderTable.name })
      .from(projectFolderTable)
      .where(and(eq(projectFolderTable.id, folderId), eq(projectFolderTable.userId, userId)))
      .limit(1)
    return createResult(folder ?? null)
  } catch (_error) {
    return createResultError(op, "The project folder could not be loaded.")
  }
}

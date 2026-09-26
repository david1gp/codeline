import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { projectFolderBootstrapEnsure } from "./projectFolderBootstrapEnsure.js"
import { projectFolderAssignmentIdResolve } from "./projectFolderAssignmentIdResolve.js"
import { projectTable } from "./projectTable.js"

export async function projectFolderAssignmentBackfill(
  database: DatabaseExecutor,
  rootDirs: readonly string[],
): Promise<Result<void>> {
  const op = "projectFolderAssignmentBackfill"

  try {
    const projects = await database
      .select({
        id: projectTable.id,
        parentFolderId: projectTable.parentFolderId,
        path: projectTable.path,
        userId: projectTable.userId,
      })
      .from(projectTable)
    const userIds = new Set(projects.map((project) => project.userId))

    for (const userId of userIds) {
      const bootstrapped = await projectFolderBootstrapEnsure(database, userId)
      if (!bootstrapped.success) return createResultError(op, bootstrapped.errorMessage)
    }

    for (const project of projects) {
      const folder = await projectFolderAssignmentIdResolve(database, project.userId, project.path, rootDirs, {
        unmatchedToPersonal: true,
      })
      if (!folder.success) return createResultError(op, folder.errorMessage)
      if (folder.data === undefined || folder.data === project.parentFolderId) continue

      await database
        .update(projectTable)
        .set({ parentFolderId: folder.data, updatedAt: new Date() })
        .where(and(eq(projectTable.id, project.id), eq(projectTable.userId, project.userId)))
    }

    return createResult(undefined)
  } catch (_error) {
    return createResultError(op, "The existing projects could not be assigned to folders.")
  }
}

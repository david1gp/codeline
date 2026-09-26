import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { projectTable, type Project } from "./projectTable.js"

export async function projectRegistryRepositoryResolve(
  database: DatabaseExecutor,
  userId: string,
  projectId: string,
): Promise<Result<Project>> {
  const op = "projectRegistryRepositoryResolve"

  try {
    const [project] = await database
      .select()
      .from(projectTable)
      .where(and(eq(projectTable.id, projectId), eq(projectTable.userId, userId)))
      .limit(1)
    if (project === undefined) return createResultError(op, "The project could not be found.")
    return createResult(project)
  } catch (_error) {
    return createResultError(op, "The project could not be loaded.")
  }
}

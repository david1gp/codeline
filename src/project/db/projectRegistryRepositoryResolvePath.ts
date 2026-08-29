import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { projectTable, type Project } from "./projectTable.js"

export async function projectRegistryRepositoryResolvePath(
  database: DatabaseExecutor,
  userId: string,
  projectPath: string,
): Promise<Result<Project | undefined>> {
  const op = "projectRegistryRepositoryResolvePath"

  try {
    const [project] = await database
      .select()
      .from(projectTable)
      .where(and(eq(projectTable.path, projectPath), eq(projectTable.userId, userId)))
      .limit(1)
    return createResult(project)
  } catch (_error) {
    return createResultError(op, "The project could not be loaded.")
  }
}

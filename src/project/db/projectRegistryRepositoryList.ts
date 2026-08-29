import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { asc, desc, eq } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { projectTable, type Project } from "./projectTable.js"

export async function projectRegistryRepositoryList(
  database: DatabaseExecutor,
  userId: string,
): Promise<Result<Project[]>> {
  const op = "projectRegistryRepositoryList"

  try {
    const projects = await database
      .select()
      .from(projectTable)
      .where(eq(projectTable.userId, userId))
      .orderBy(desc(projectTable.updatedAt), asc(projectTable.path), asc(projectTable.id))
    return createResult(projects)
  } catch (_error) {
    return createResultError(op, "The projects could not be loaded.")
  }
}

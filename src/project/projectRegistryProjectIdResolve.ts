import * as path from "node:path"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { DatabaseExecutor } from "../database/databaseClient.js"
import { projectRegistryRepositoryResolvePath } from "./db/projectRegistryRepositoryResolvePath.js"

export async function projectRegistryProjectIdResolve(
  database: DatabaseExecutor,
  userId: string,
  projectPath: string,
): Promise<Result<string | undefined>> {
  const op = "projectRegistryProjectIdResolve"
  if (projectPath === "~" || !path.isAbsolute(projectPath)) return createResult(undefined)

  const project = await projectRegistryRepositoryResolvePath(database, userId, projectPath)
  if (!project.success) return createResultError(op, project.errorMessage)
  return createResult(project.data?.id)
}

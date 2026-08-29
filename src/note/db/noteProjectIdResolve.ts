import * as path from "node:path"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { projectRegistryRepositoryResolvePath } from "../../project/db/projectRegistryRepositoryResolvePath.js"
import { projectDirectoryCanonicalPathResolve } from "../../project/projectDirectoryCanonicalPathResolve.js"

export async function noteProjectIdResolve(
  database: DatabaseExecutor,
  userId: string,
  projectPath: string | null,
): Promise<Result<string | null>> {
  const op = "noteProjectIdResolve"
  if (projectPath === null || !path.isAbsolute(projectPath)) return createResult(null)
  const canonical = await projectDirectoryCanonicalPathResolve(projectPath)
  const resolvedPath = canonical.success ? canonical.data : path.resolve(projectPath)
  const project = await projectRegistryRepositoryResolvePath(database, userId, resolvedPath)
  if (!project.success) return createResultError(op, project.errorMessage)
  return createResult(project.data?.id ?? null)
}

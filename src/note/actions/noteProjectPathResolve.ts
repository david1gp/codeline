import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { projectDirectoryCanonicalPathResolve } from "../../project/projectDirectoryCanonicalPathResolve.js"
import { projectRegistryRepositoryResolvePath } from "../../project/db/projectRegistryRepositoryResolvePath.js"
import { projectResolve } from "../../project/projectResolve.js"

export async function noteProjectPathResolve(
  database: DatabaseClient,
  userId: string,
  projectId: string | null,
  options: {
    historicalProjectPath?: string | null
    projectRootDirs?: readonly string[]
  } = {},
): Promise<Result<string | null>> {
  const op = "noteProjectPathResolve"
  if (projectId === null) return createResult(null)

  const historicalProjectPath = options.historicalProjectPath
  if (historicalProjectPath !== undefined && historicalProjectPath !== null) {
    const historicalPath = await projectRegistryProjectPathResolve(database, userId, historicalProjectPath)
    if (historicalPath.success && historicalPath.data?.id === projectId) return createResult(historicalProjectPath)
    const canonical = await projectDirectoryCanonicalPathResolve(historicalProjectPath)
    if (canonical.success) {
      const canonicalProject = await projectRegistryRepositoryResolvePath(database, userId, canonical.data)
      if (canonicalProject.success && canonicalProject.data?.id === projectId)
        return createResult(historicalProjectPath)
    }
  }

  const resolved = await projectResolve(options.projectRootDirs ?? [], projectId, { database, userId })
  if (resolved.success) return createResult(resolved.data.rootDir)

  return createResultError(op, "The project could not be found.")
}

async function projectRegistryProjectPathResolve(database: DatabaseClient, userId: string, projectPath: string) {
  return projectRegistryRepositoryResolvePath(database, userId, projectPath)
}

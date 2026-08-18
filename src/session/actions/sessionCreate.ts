import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { projectPathReferenceResolve } from "../../project/projectPathReferenceResolve.js"
import { sessionRepositoryCreate } from "../db/sessionRepositoryCreate.js"

export async function sessionCreate(
  database: DatabaseExecutor,
  userId: string,
  input: Omit<Parameters<typeof sessionRepositoryCreate>[2], "projectPath" | "pinned"> & { projectPath?: string },
  options: { projectRootDirs?: readonly string[] } = {},
): ReturnType<typeof sessionRepositoryCreate> {
  const projectPath = await projectPathReferenceResolve(input.projectPath, options.projectRootDirs ?? [])
  if (!projectPath.success) return projectPath
  return sessionRepositoryCreate(database, userId, { ...input, pinned: true, projectPath: projectPath.data })
}

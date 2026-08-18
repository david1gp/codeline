import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { projectPathReferenceResolve } from "../../project/projectPathReferenceResolve.js"
import { sessionRepositoryCreate } from "../db/sessionRepositoryCreate.js"

export async function sessionCreate(
  database: DatabaseExecutor,
  userId: string,
  input: Omit<Parameters<typeof sessionRepositoryCreate>[3], "projectPath" | "pinned"> & { projectPath?: string },
  options: { organizationId: string; projectRootDirs?: readonly string[] },
): ReturnType<typeof sessionRepositoryCreate> {
  const projectPath = await projectPathReferenceResolve(input.projectPath, options.projectRootDirs ?? [])
  if (!projectPath.success) return projectPath
  return sessionRepositoryCreate(database, userId, options.organizationId, {
    ...input,
    pinned: true,
    projectPath: projectPath.data,
  })
}

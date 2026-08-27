import { createResultError } from "@adaptive-ds/result"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { projectPathReferenceResolve } from "../../project/projectPathReferenceResolve.js"
import { skillSelectionDefaultRepositoryLoad } from "../db/skillSelectionDefaultRepositoryLoad.js"

export async function skillSelectionDefaultLoad(
  database: DatabaseClient,
  userId: string,
  projectPath?: string,
  options: { projectRootDirs?: readonly string[] } = {},
): ReturnType<typeof skillSelectionDefaultRepositoryLoad> {
  const project = await projectPathReferenceResolve(projectPath, options.projectRootDirs ?? [])
  if (!project.success) return createResultError("skillSelectionDefaultLoad", "The project path is invalid.")
  return skillSelectionDefaultRepositoryLoad(database, userId, project.data)
}

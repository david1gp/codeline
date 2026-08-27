import { createResultError } from "@adaptive-ds/result"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { projectPathReferenceResolve } from "../../project/projectPathReferenceResolve.js"
import { skillSelectionDefaultRepositoryDelete } from "../db/skillSelectionDefaultRepositoryDelete.js"

export async function skillSelectionDefaultDelete(
  database: DatabaseClient,
  userId: string,
  projectPath?: string,
  options: { projectRootDirs?: readonly string[] } = {},
): ReturnType<typeof skillSelectionDefaultRepositoryDelete> {
  const project = await projectPathReferenceResolve(projectPath, options.projectRootDirs ?? [])
  if (!project.success) return createResultError("skillSelectionDefaultDelete", "The project path is invalid.")
  return skillSelectionDefaultRepositoryDelete(database, userId, project.data)
}

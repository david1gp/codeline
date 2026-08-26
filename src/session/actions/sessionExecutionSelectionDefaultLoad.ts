import { createResultErrorCode } from "@adaptive-ds/result"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { projectPathReferenceResolve } from "../../project/projectPathReferenceResolve.js"
import { sessionExecutionSelectionDefaultRepositoryLoad } from "../db/sessionExecutionSelectionDefaultRepositoryLoad.js"
import { sessionExecutionSelectionErrorCodes } from "../errors/sessionExecutionSelectionErrorCodes.js"

export async function sessionExecutionSelectionDefaultLoad(
  database: DatabaseClient,
  userId: string,
  projectPath?: string,
  options: { projectRootDirs?: readonly string[] } = {},
): ReturnType<typeof sessionExecutionSelectionDefaultRepositoryLoad> {
  const project = await projectPathReferenceResolve(projectPath, options.projectRootDirs ?? [])
  if (!project.success)
    return createResultErrorCode(
      "sessionExecutionSelectionDefaultLoad",
      "The project path is invalid.",
      sessionExecutionSelectionErrorCodes.projectPathInvalid,
    )
  return sessionExecutionSelectionDefaultRepositoryLoad(database, userId, project.data)
}

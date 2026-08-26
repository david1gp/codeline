import { createResultErrorCode } from "@adaptive-ds/result"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { projectPathReferenceResolve } from "../../project/projectPathReferenceResolve.js"
import { sessionExecutionSelectionDefaultRepositoryDelete } from "../db/sessionExecutionSelectionDefaultRepositoryDelete.js"
import { sessionExecutionSelectionErrorCodes } from "../errors/sessionExecutionSelectionErrorCodes.js"

export async function sessionExecutionSelectionDefaultDelete(
  database: DatabaseClient,
  userId: string,
  projectPath?: string,
  options: { projectRootDirs?: readonly string[] } = {},
): ReturnType<typeof sessionExecutionSelectionDefaultRepositoryDelete> {
  const project = await projectPathReferenceResolve(projectPath, options.projectRootDirs ?? [])
  if (!project.success)
    return createResultErrorCode(
      "sessionExecutionSelectionDefaultDelete",
      "The project path is invalid.",
      sessionExecutionSelectionErrorCodes.projectPathInvalid,
    )
  return sessionExecutionSelectionDefaultRepositoryDelete(database, userId, project.data)
}

import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { projectFolderBootstrapKeyResolve } from "../projectFolderBootstrapKeyResolve.js"
import type { ProjectFolderBootstrapKey } from "../projectFolderBootstrapKeySchema.js"
import { projectFolderBootstrapIdLoad } from "./projectFolderBootstrapIdLoad.js"

type ProjectFolderAssignmentIdResolveOptions = {
  unmatchedToPersonal?: boolean
}

export async function projectFolderAssignmentIdResolve(
  database: DatabaseExecutor,
  userId: string,
  projectPath: string,
  rootDirs: readonly string[],
  options: ProjectFolderAssignmentIdResolveOptions = {},
): Promise<Result<string | undefined>> {
  const op = "projectFolderAssignmentIdResolve"
  const key = await projectFolderBootstrapKeyResolve(projectPath, rootDirs)
  const assignmentKey: ProjectFolderBootstrapKey | undefined =
    key ?? (options.unmatchedToPersonal === true ? "personal" : undefined)
  if (assignmentKey === undefined) return createResult(undefined)

  const folder = await projectFolderBootstrapIdLoad(database, userId, assignmentKey)
  if (!folder.success) return createResultError(op, folder.errorMessage)
  return createResult(folder.data)
}

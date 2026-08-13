import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { projectGitBranchNameSchema } from "./projectGitBranchNameSchema.js"
import { projectGitCommandRun } from "./projectGitCommandRun.js"
import { type ProjectGitCommand, projectGitRepositoryResolve } from "./projectGitRepositoryResolve.js"

type ProjectGitBranchRenameOptions = {
  command?: ProjectGitCommand
}

export async function projectGitBranchRename(
  rootDir: string,
  branch: string,
  newBranch: string,
  options: ProjectGitBranchRenameOptions = {},
): Promise<Result<void>> {
  const op = "projectGitBranchRename"
  const parsedBranch = v.safeParse(projectGitBranchNameSchema, branch)
  const parsedNewBranch = v.safeParse(projectGitBranchNameSchema, newBranch)
  if (!parsedBranch.success || !parsedNewBranch.success) {
    return createResultError(op, "The Git branch name is invalid.")
  }

  const command = options.command ?? projectGitCommandRun
  const repository = await projectGitRepositoryResolve(rootDir, { command })
  if (!repository.success) return createResultError(op, repository.errorMessage)
  if (repository.data === null) return createResultError(op, "The trusted Git repository is unavailable.")
  if (repository.data.branch === null) {
    return createResultError(op, "Git branches cannot be changed from a detached HEAD.")
  }

  try {
    const result = await repository.data.command(["branch", "-m", "--", parsedBranch.output, parsedNewBranch.output])
    if (!result.success || result.data.exitCode !== 0) {
      return createResultError(op, "The Git branch could not be renamed.")
    }
  } catch (_error) {
    return createResultError(op, "The Git branch could not be renamed.")
  }

  return createResult(undefined)
}

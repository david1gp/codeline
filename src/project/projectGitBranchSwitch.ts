import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { projectGitBranchNameSchema } from "./projectGitBranchNameSchema.js"
import { projectGitCommandRun } from "./projectGitCommandRun.js"
import { type ProjectGitCommand, projectGitRepositoryResolve } from "./projectGitRepositoryResolve.js"

type ProjectGitBranchSwitchOptions = {
  command?: ProjectGitCommand
}

export async function projectGitBranchSwitch(
  rootDir: string,
  branch: string,
  options: ProjectGitBranchSwitchOptions = {},
): Promise<Result<void>> {
  const op = "projectGitBranchSwitch"
  const parsedBranch = v.safeParse(projectGitBranchNameSchema, branch)
  if (!parsedBranch.success) return createResultError(op, "The Git branch name is invalid.")

  const command = options.command ?? projectGitCommandRun
  const repository = await projectGitRepositoryResolve(rootDir, { command })
  if (!repository.success) return createResultError(op, repository.errorMessage)
  if (repository.data === null) return createResultError(op, "The trusted Git repository is unavailable.")
  if (repository.data.branch === null) {
    return createResultError(op, "Git branches cannot be changed from a detached HEAD.")
  }

  try {
    const result = await repository.data.command(["switch", "--no-guess", "--", parsedBranch.output])
    if (!result.success || result.data.exitCode !== 0) {
      return createResultError(op, "The Git branch could not be switched.")
    }
  } catch (_error) {
    return createResultError(op, "The Git branch could not be switched.")
  }

  return createResult(undefined)
}

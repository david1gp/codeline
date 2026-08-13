import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import type { ProjectGitBranchList } from "./projectGitBranchListSchema.js"
import { projectGitBranchNameSchema } from "./projectGitBranchNameSchema.js"
import { projectGitCommandRun } from "./projectGitCommandRun.js"
import { type ProjectGitCommand, projectGitRepositoryResolve } from "./projectGitRepositoryResolve.js"

const projectGitBranchListMaxBranches = 1000
const projectGitBranchListMaxOutputBytes = 4 * 1024 * 1024

type ProjectGitBranchListReadOptions = {
  command?: ProjectGitCommand
}

function projectGitBranchListParse(output: string): Result<string[]> {
  const op = "projectGitBranchListRead"
  if (new TextEncoder().encode(output).byteLength > projectGitBranchListMaxOutputBytes) {
    return createResultError(op, "The Git branch list exceeds the configured output limit.")
  }

  const normalized = output.replaceAll("\r\n", "\n")
  const lines = normalized.split("\n")
  if (lines.at(-1) === "") lines.pop()
  if (lines.length > projectGitBranchListMaxBranches) {
    return createResultError(op, "The Git repository contains too many local branches.")
  }

  const branches: string[] = []
  for (const line of lines) {
    if (!v.safeParse(projectGitBranchNameSchema, line).success) {
      return createResultError(op, "The Git branch list contains an invalid branch name.")
    }
    branches.push(line)
  }
  return createResult(branches)
}

export async function projectGitBranchListRead(
  rootDir: string,
  options: ProjectGitBranchListReadOptions = {},
): Promise<Result<ProjectGitBranchList>> {
  const op = "projectGitBranchListRead"
  const command = options.command ?? projectGitCommandRun
  const repository = await projectGitRepositoryResolve(rootDir, { command })
  if (!repository.success) return createResultError(op, repository.errorMessage)
  if (repository.data === null) return createResultError(op, "The trusted Git repository is unavailable.")
  const resolvedRepository = repository.data

  let result: Awaited<ReturnType<typeof resolvedRepository.command>>
  try {
    result = await resolvedRepository.command(
      ["for-each-ref", "--sort=refname", "--format=%(refname:lstrip=2)", "refs/heads/"],
      { maxOutputBytes: projectGitBranchListMaxOutputBytes },
    )
  } catch (_error) {
    return createResultError(op, "The Git branches could not be listed.")
  }
  if (!result.success || result.data.exitCode !== 0) {
    return createResultError(op, "The Git branches could not be listed.")
  }

  const parsed = projectGitBranchListParse(result.data.stdout)
  if (!parsed.success) return parsed
  if (resolvedRepository.branch !== null && !parsed.data.includes(resolvedRepository.branch)) {
    return createResultError(op, "The Git branch list response is invalid.")
  }

  return createResult({
    currentBranch: resolvedRepository.branch,
    otherBranches: parsed.data.filter((branch) => branch !== resolvedRepository.branch),
  })
}

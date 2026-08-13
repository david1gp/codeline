import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { projectGitCommandRun, type ProjectGitCommandOutput } from "./projectGitCommandRun.js"
import { projectGitRepositoryResolve, type ProjectGitCommand } from "./projectGitRepositoryResolve.js"
import type { ProjectGitStatusFile } from "./projectGitStatusFileSchema.js"
import type { ProjectGitStatus } from "./projectGitStatusSchema.js"
import { projectPathValidate } from "./projectPathValidate.js"

const projectGitStatusMaxFiles = 1000
const projectGitStatusMaxOutputBytes = 4 * 1024 * 1024

type ProjectGitStatusReadOptions = {
  command?: ProjectGitCommand
}

function projectGitStatusPathIsSafe(value: string): boolean {
  if (value.length === 0 || value.length > 4096) return false
  if (
    [...value].some((character) => {
      const code = character.charCodeAt(0)
      return code < 32 || code === 127
    })
  ) {
    return false
  }
  const validated = projectPathValidate(value)
  return validated.success && validated.data.normalizedPath === value
}

function projectGitStatusFileResolve(indexStatus: string, worktreeStatus: string): ProjectGitStatusFile["status"] {
  const pair = `${indexStatus}${worktreeStatus}`
  if (pair === "??") return "untracked"
  if (pair.includes("U")) return "conflict"
  if (pair.includes("D")) return "deleted"
  if (pair.includes("R")) return "renamed"
  if (pair.includes("C")) return "copied"
  if (pair.includes("A")) return "added"
  return "modified"
}

function projectGitStatusParse(output: string): Result<ProjectGitStatusFile[]> {
  const op = "projectGitStatusRead"
  if (new TextEncoder().encode(output).byteLength > projectGitStatusMaxOutputBytes) {
    return createResultError(op, "The Git status exceeds the configured output limit.")
  }

  const files: ProjectGitStatusFile[] = []
  const records = output.split("\0")
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    if (record === undefined || record === "") continue
    if (record.length < 4 || record[2] !== " ") {
      return createResultError(op, "The Git status response is invalid.")
    }

    const indexStatus = record[0]
    const worktreeStatus = record[1]
    const path = record.slice(3)
    if (indexStatus === undefined || worktreeStatus === undefined || !projectGitStatusPathIsSafe(path)) {
      return createResultError(op, "The Git status contains an invalid relative path.")
    }

    const status = projectGitStatusFileResolve(indexStatus, worktreeStatus)
    let originalPath: string | undefined
    if (status === "renamed" || status === "copied") {
      const candidate = records[index + 1]
      if (candidate === undefined || !projectGitStatusPathIsSafe(candidate)) {
        return createResultError(op, "The Git status contains an invalid rename path.")
      }
      originalPath = candidate
      index += 1
    }

    if (files.length >= projectGitStatusMaxFiles) {
      return createResultError(op, "The Git status contains too many files.")
    }
    files.push(originalPath === undefined ? { path, status } : { originalPath, path, status })
  }

  return createResult(files)
}

function projectGitStatusCommandFailure(): Result<never> {
  return createResultError("projectGitStatusRead", "The Git status could not be read.")
}

export async function projectGitStatusRead(
  rootDir: string,
  options: ProjectGitStatusReadOptions = {},
): Promise<Result<ProjectGitStatus>> {
  const op = "projectGitStatusRead"
  const command = options.command ?? projectGitCommandRun
  const repository = await projectGitRepositoryResolve(rootDir, { command })
  if (!repository.success) return createResultError(op, repository.errorMessage)
  if (repository.data === null) {
    return createResult({ branch: null, files: [], isDirty: false, isGitRepository: false })
  }

  let status: Result<ProjectGitCommandOutput>
  try {
    status = await command(repository.data.rootDir, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], {
      maxOutputBytes: projectGitStatusMaxOutputBytes,
    })
  } catch (_error) {
    return projectGitStatusCommandFailure()
  }
  if (!status.success || status.data.exitCode !== 0) return projectGitStatusCommandFailure()

  const files = projectGitStatusParse(status.data.stdout)
  if (!files.success) return files

  return createResult({
    branch: repository.data.branch,
    files: files.data,
    isDirty: files.data.length > 0,
    isGitRepository: true,
  })
}

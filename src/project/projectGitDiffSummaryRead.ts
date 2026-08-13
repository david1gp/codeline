import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { projectGitCommandRun, type ProjectGitCommandOutput } from "./projectGitCommandRun.js"
import { projectGitRepositoryResolve, type ProjectGitCommand } from "./projectGitRepositoryResolve.js"
import type { ProjectGitDiffSummary } from "./projectGitDiffSummarySchema.js"

const projectGitDiffSummaryMaxFiles = 1000
const projectGitDiffSummaryMaxOutputBytes = 4 * 1024 * 1024
const projectGitDiffSummaryMaxLineCount = 1_000_000_000

type ProjectGitDiffSummaryReadOptions = {
  command?: ProjectGitCommand
}

function projectGitDiffSummaryParse(output: string): Result<Omit<ProjectGitDiffSummary, "isGitRepository">> {
  const op = "projectGitDiffSummaryRead"
  if (new TextEncoder().encode(output).byteLength > projectGitDiffSummaryMaxOutputBytes) {
    return createResultError(op, "The Git diff summary exceeds the configured output limit.")
  }

  let additions = 0
  let binaryFiles = 0
  let deletions = 0
  let filesChanged = 0
  for (const line of output.replaceAll("\r\n", "\n").split("\n")) {
    if (line === "") continue
    const fields = line.split("\t")
    const added = fields[0]
    const deleted = fields[1]
    if (added === undefined || deleted === undefined || fields.length < 3) {
      return createResultError(op, "The Git diff summary response is invalid.")
    }
    if (added === "-" && deleted === "-") {
      binaryFiles += 1
    } else {
      if (!/^\d+$/u.test(added) || !/^\d+$/u.test(deleted)) {
        return createResultError(op, "The Git diff summary response is invalid.")
      }
      const addedCount = Number(added)
      const deletedCount = Number(deleted)
      if (
        !Number.isSafeInteger(addedCount) ||
        !Number.isSafeInteger(deletedCount) ||
        addedCount > projectGitDiffSummaryMaxLineCount ||
        deletedCount > projectGitDiffSummaryMaxLineCount
      ) {
        return createResultError(op, "The Git diff summary contains counts outside the configured limit.")
      }
      additions += addedCount
      deletions += deletedCount
    }
    filesChanged += 1
    if (
      filesChanged > projectGitDiffSummaryMaxFiles ||
      additions > projectGitDiffSummaryMaxLineCount ||
      deletions > projectGitDiffSummaryMaxLineCount ||
      binaryFiles > projectGitDiffSummaryMaxFiles
    ) {
      return createResultError(op, "The Git diff summary exceeds the configured limit.")
    }
  }

  return createResult({ additions, binaryFiles, deletions, filesChanged })
}

function projectGitDiffSummaryCommandFailure(): Result<never> {
  return createResultError("projectGitDiffSummaryRead", "The Git diff summary could not be read.")
}

async function projectGitDiffSummaryReadCommand(
  command: ProjectGitCommand,
  rootDir: string,
  args: readonly string[],
): Promise<Result<ProjectGitCommandOutput>> {
  try {
    return await command(rootDir, args, { maxOutputBytes: projectGitDiffSummaryMaxOutputBytes })
  } catch (_error) {
    return projectGitDiffSummaryCommandFailure()
  }
}

export async function projectGitDiffSummaryRead(
  rootDir: string,
  options: ProjectGitDiffSummaryReadOptions = {},
): Promise<Result<ProjectGitDiffSummary>> {
  const op = "projectGitDiffSummaryRead"
  const command = options.command ?? projectGitCommandRun
  const repository = await projectGitRepositoryResolve(rootDir, { command })
  if (!repository.success) return createResultError(op, repository.errorMessage)
  if (repository.data === null) {
    return createResult({
      additions: 0,
      binaryFiles: 0,
      deletions: 0,
      filesChanged: 0,
      isGitRepository: false,
    })
  }

  const diff = await projectGitDiffSummaryReadCommand(command, repository.data.rootDir, [
    "diff",
    "--no-color",
    "--no-ext-diff",
    "--no-textconv",
    "--numstat",
    "HEAD",
    "--",
  ])
  if (!diff.success) return diff

  let summaryOutput = diff.data.stdout
  if (diff.data.exitCode !== 0) {
    const [unstaged, staged] = await Promise.all([
      projectGitDiffSummaryReadCommand(command, repository.data.rootDir, [
        "diff",
        "--no-color",
        "--no-ext-diff",
        "--no-textconv",
        "--numstat",
        "--",
      ]),
      projectGitDiffSummaryReadCommand(command, repository.data.rootDir, [
        "diff",
        "--cached",
        "--no-color",
        "--no-ext-diff",
        "--no-textconv",
        "--numstat",
        "--",
      ]),
    ])
    if (!unstaged.success || !staged.success || unstaged.data.exitCode !== 0 || staged.data.exitCode !== 0) {
      return projectGitDiffSummaryCommandFailure()
    }
    summaryOutput = `${unstaged.data.stdout}\n${staged.data.stdout}`
  }

  const summary = projectGitDiffSummaryParse(summaryOutput)
  if (!summary.success) return summary
  return createResult({ ...summary.data, isGitRepository: true })
}

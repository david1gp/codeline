import * as fs from "node:fs/promises"
import * as path from "node:path"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { projectGitBranchNameSchema } from "./projectGitBranchNameSchema.js"
import {
  type ProjectGitCommandOptions,
  type ProjectGitCommandOutput,
  projectGitCommandRun,
} from "./projectGitCommandRun.js"
import { projectPathResolve } from "./projectPathResolve.js"

export type ProjectGitCommand = (
  rootDir: string,
  args: readonly string[],
  options?: ProjectGitCommandOptions,
) => Promise<Result<ProjectGitCommandOutput>>

export type ProjectGitRepository = {
  branch: string | null
  command: (args: readonly string[], options?: ProjectGitCommandOptions) => Promise<Result<ProjectGitCommandOutput>>
}

type ProjectGitRepositoryResolveOptions = {
  command?: ProjectGitCommand
}

function projectGitRepositoryOutputLines(output: string): string[] | undefined {
  if (new TextEncoder().encode(output).byteLength > 4 * 1024 * 1024) return undefined
  const lines = output.replaceAll("\r\n", "\n").split("\n")
  if (lines.at(-1) === "") lines.pop()
  return lines.length === 5 ? lines : undefined
}

function projectGitRepositoryBranchResolve(value: string): string | null | undefined {
  if (value === "" || value === "HEAD") return null
  return v.safeParse(projectGitBranchNameSchema, value).success ? value : undefined
}

export async function projectGitRepositoryResolve(
  rootDir: string,
  options: ProjectGitRepositoryResolveOptions = {},
): Promise<Result<ProjectGitRepository | null>> {
  const op = "projectGitRepositoryResolve"
  const resolved = await projectPathResolve(rootDir, "")
  if (!resolved.success) return createResultError(op, "The trusted project root is unavailable.")

  const command = options.command ?? projectGitCommandRun
  let probe: Result<ProjectGitCommandOutput>
  try {
    probe = await command(resolved.data.resolvedRoot, [
      "rev-parse",
      "--path-format=absolute",
      "--show-toplevel",
      "--git-dir",
      "--git-common-dir",
      "--is-inside-work-tree",
      "--abbrev-ref",
      "HEAD",
    ])
  } catch (_error) {
    return createResultError(op, "The Git repository could not be inspected.")
  }
  if (!probe.success) return createResultError(op, "The Git repository could not be inspected.")
  if (probe.data.exitCode !== 0) return createResult(null)

  const lines = projectGitRepositoryOutputLines(probe.data.stdout)
  if (lines === undefined || lines[3] !== "true") {
    return createResultError(op, "The Git repository response is invalid.")
  }

  const repositoryRoot = lines[0]
  const gitDir = lines[1]
  const commonGitDir = lines[2]
  if (
    repositoryRoot === undefined ||
    gitDir === undefined ||
    commonGitDir === undefined ||
    !path.isAbsolute(repositoryRoot) ||
    !path.isAbsolute(gitDir) ||
    !path.isAbsolute(commonGitDir)
  ) {
    return createResultError(op, "The Git repository response is invalid.")
  }

  let canonicalRepositoryRoot: string
  let canonicalGitDir: string
  let canonicalCommonGitDir: string
  try {
    canonicalRepositoryRoot = await fs.realpath(repositoryRoot)
    canonicalGitDir = await fs.realpath(gitDir)
    canonicalCommonGitDir = await fs.realpath(commonGitDir)
  } catch (_error) {
    return createResultError(op, "The Git repository root is not trusted.")
  }
  if (
    canonicalRepositoryRoot !== resolved.data.resolvedRoot ||
    canonicalGitDir !== canonicalCommonGitDir ||
    canonicalGitDir !== path.join(resolved.data.resolvedRoot, ".git")
  ) {
    return createResultError(op, "The Git repository root is not trusted.")
  }

  const branch = projectGitRepositoryBranchResolve(lines[4] ?? "")
  if (branch === undefined) return createResultError(op, "The Git repository branch is invalid.")

  return createResult({
    branch,
    command: (args, options) => command(resolved.data.resolvedRoot, args, options),
  })
}

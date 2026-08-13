import * as fs from "node:fs/promises"
import * as path from "node:path"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import {
  projectGitCommandRun,
  type ProjectGitCommandOptions,
  type ProjectGitCommandOutput,
} from "./projectGitCommandRun.js"
import { projectPathResolve } from "./projectPathResolve.js"

const projectGitRepositoryMaxBranchLength = 256

export type ProjectGitCommand = (
  rootDir: string,
  args: readonly string[],
  options?: ProjectGitCommandOptions,
) => Promise<Result<ProjectGitCommandOutput>>

export type ProjectGitRepository = {
  rootDir: string
  branch: string | null
}

type ProjectGitRepositoryResolveOptions = {
  command?: ProjectGitCommand
}

function projectGitRepositoryOutputLines(output: string): string[] | undefined {
  if (new TextEncoder().encode(output).byteLength > 4 * 1024 * 1024) return undefined
  const lines = output.replaceAll("\r\n", "\n").split("\n")
  if (lines.at(-1) === "") lines.pop()
  return lines.length === 3 ? lines : undefined
}

function projectGitRepositoryBranchResolve(value: string): string | null | undefined {
  if (value === "" || value === "HEAD") return null
  if (
    value.length > projectGitRepositoryMaxBranchLength ||
    [...value].some((character) => {
      const code = character.charCodeAt(0)
      return code < 32 || code === 127
    })
  ) {
    return undefined
  }
  return value
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
      "--show-toplevel",
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
  if (lines === undefined || lines[1] !== "true") {
    return createResultError(op, "The Git repository response is invalid.")
  }

  const repositoryRoot = lines[0]
  if (repositoryRoot === undefined || !path.isAbsolute(repositoryRoot)) {
    return createResultError(op, "The Git repository response is invalid.")
  }

  let canonicalRepositoryRoot: string
  try {
    canonicalRepositoryRoot = await fs.realpath(repositoryRoot)
  } catch (_error) {
    return createResultError(op, "The Git repository root is not trusted.")
  }
  if (canonicalRepositoryRoot !== resolved.data.resolvedRoot) {
    return createResultError(op, "The Git repository root is not trusted.")
  }

  const branch = projectGitRepositoryBranchResolve(lines[2] ?? "")
  if (branch === undefined) return createResultError(op, "The Git repository branch is invalid.")

  return createResult({ rootDir: resolved.data.resolvedRoot, branch })
}

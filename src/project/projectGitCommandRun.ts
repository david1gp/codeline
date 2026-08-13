import { createResult, createResultError, type Result } from "@adaptive-ds/result"

const projectGitCommandDefaultMaxOutputBytes = 4 * 1024 * 1024
const projectGitCommandDefaultTimeoutMs = 10_000
const projectGitCommandMaxOutputBytes = 16 * 1024 * 1024
const projectGitCommandMaxTimeoutMs = 30_000

export type ProjectGitCommandOutput = {
  stdout: string
  stderr: string
  exitCode: number
}

export type ProjectGitCommandOptions = {
  maxOutputBytes?: number
  timeoutMs?: number
}

function projectGitCommandLimitResolve(
  value: number | undefined,
  fallback: number,
  maximum: number,
): number | undefined {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || value <= 0) return undefined
  return Math.min(value, maximum)
}

export async function projectGitCommandRun(
  rootDir: string,
  args: readonly string[],
  options: ProjectGitCommandOptions = {},
): Promise<Result<ProjectGitCommandOutput>> {
  const op = "projectGitCommandRun"
  const maxOutputBytes = projectGitCommandLimitResolve(
    options.maxOutputBytes,
    projectGitCommandDefaultMaxOutputBytes,
    projectGitCommandMaxOutputBytes,
  )
  const timeoutMs = projectGitCommandLimitResolve(
    options.timeoutMs,
    projectGitCommandDefaultTimeoutMs,
    projectGitCommandMaxTimeoutMs,
  )
  if (maxOutputBytes === undefined || timeoutMs === undefined) {
    return createResultError(op, "Git command limits are invalid.")
  }

  if (args.some((arg) => typeof arg !== "string" || arg.includes("\0"))) {
    return createResultError(op, "Git command arguments are invalid.")
  }

  try {
    const environment: Record<string, string | undefined> = {}
    for (const [key, value] of Object.entries(process.env)) environment[key] = value
    environment.GIT_CONFIG_NOSYSTEM = "1"
    environment.GIT_OPTIONAL_LOCKS = "0"
    environment.GIT_PAGER = "cat"
    environment.GIT_TERMINAL_PROMPT = "0"
    environment.LC_ALL = "C"

    const process = Bun.spawn({
      cmd: ["git", ...args],
      cwd: rootDir,
      env: environment,
      maxBuffer: maxOutputBytes,
      stderr: "pipe",
      stdout: "pipe",
      timeout: timeoutMs,
    })
    const [stdout, stderr, exitCode] = await Promise.all([
      process.stdout === null ? "" : new Response(process.stdout).text(),
      process.stderr === null ? "" : new Response(process.stderr).text(),
      process.exited,
    ])

    const outputBytes = new TextEncoder().encode(stdout).byteLength + new TextEncoder().encode(stderr).byteLength
    if (outputBytes > maxOutputBytes) {
      return createResultError(op, "The Git command output exceeds the configured limit.")
    }

    return createResult({ stdout, stderr, exitCode })
  } catch (_error) {
    return createResultError(op, "The Git command could not be executed.")
  }
}

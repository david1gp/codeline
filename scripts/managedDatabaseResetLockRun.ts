import { createHash } from "node:crypto"
import path from "node:path"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { databasePath } from "../src/database/databasePath.js"

const lockHeldEnvironmentName = "CODELINE_MANAGED_DATABASE_RESET_LOCK_HELD"
const lockConflictExitCode = 75

function lockPathCreate(databaseFilePath: string): string {
  const lockIdentity = ["managed-sqlite", path.resolve(databaseFilePath)].join("|")
  const lockKey = createHash("sha256").update(lockIdentity).digest("hex")
  const lockDirectory = Bun.env.XDG_RUNTIME_DIR ?? "/tmp"
  return `${lockDirectory}/codeline-managed-database-reset-${lockKey}.lock`
}

export async function managedDatabaseResetLockRun(command: string[]): Promise<Result<number>> {
  const op = "managedDatabaseResetLockRun"
  if (command.length === 0) return createResultError(op, "A reset command is required after --.")

  const flock = Bun.which("flock")
  if (flock === null) {
    return createResultError(op, "flock is required to prevent concurrent managed database reset commands.")
  }

  try {
    const child = Bun.spawn(
      [
        flock,
        "--exclusive",
        "--nonblock",
        "--conflict-exit-code",
        String(lockConflictExitCode),
        lockPathCreate(databasePath),
        ...command,
      ],
      {
        env: { ...process.env, [lockHeldEnvironmentName]: "1" },
        stderr: "inherit",
        stdin: "inherit",
        stdout: "inherit",
      },
    )
    const exitCode = await child.exited
    if (exitCode === lockConflictExitCode) {
      return createResultError(
        op,
        "Another managed database reset/bootstrap command is already running for this database; refusing to overlap it.",
      )
    }
    return createResult(exitCode)
  } catch (error) {
    return createResultError(
      op,
      error instanceof Error ? error.message : "Unable to run the managed database reset lock.",
    )
  }
}

if (import.meta.main) {
  const argumentsList = Bun.argv.slice(2)
  const command = argumentsList[0] === "--" ? argumentsList.slice(1) : argumentsList
  if (command.length === 0) {
    console.error("Usage: bun scripts/managedDatabaseResetLockRun.ts -- <command> [args]")
    process.exit(2)
  }

  const result = await managedDatabaseResetLockRun(command)
  if (!result.success) {
    console.error(result.errorMessage)
    process.exit(1)
  }
  process.exit(result.data)
}

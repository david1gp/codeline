import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { e2eRepositoryRoot } from "./e2eRepositoryRoot.js"

const execFileAsync = promisify(execFile)

/**
 * Re-runs the repository-owned deterministic seed so the checked-in example
 * sessions belong to the supplied synthetic member. Ownership is the only thing
 * that changes: the fixture rows, identifiers, and message bodies stay the same,
 * which keeps the settled-session assertions stable across runs.
 */
export async function e2eExampleDataSeedForMember(input: { subject: string; userId: string }): Promise<void> {
  // The empty roots value selects fixture-only seed mode for this child process. It
  // does not configure the already-running managed API; project registration for
  // direct session creation goes through its API in e2eSessionCreate.
  const fixtureEnvironment = {
    ...process.env,
    CODELINE_PROJECT_ROOTS: "[]",
    EXAMPLE_DATA_SUBJECT: input.subject,
    EXAMPLE_DATA_USER_ID: input.userId,
  }
  await execFileAsync("bun", ["run", "db:seed"], {
    cwd: e2eRepositoryRoot,
    env: fixtureEnvironment,
  })
}

/**
 * Returns the example data to its default fixture owner after a run purged the
 * synthetic members, so the shared development database is left as it was found.
 */
export async function e2eExampleDataSeedRestore(): Promise<void> {
  await execFileAsync("bun", ["run", "db:seed"], { cwd: e2eRepositoryRoot })
}

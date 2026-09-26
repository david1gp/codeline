import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const managedApiUnit = "codeline-dev-api.service"

function jsonLineParse(line: string): unknown | undefined {
  try {
    return JSON.parse(line)
  } catch (_error) {
    return undefined
  }
}

/** Reads only the repository-managed API unit journal; client logs are never read from SQLite. */
export async function e2eManagedApiJournalRead(since: Date): Promise<unknown[]> {
  const { stdout } = await execFileAsync(
    "journalctl",
    [
      "--user",
      "--unit",
      managedApiUnit,
      "--since",
      `@${Math.floor(since.getTime() / 1000)}`,
      "--no-pager",
      "--output",
      "cat",
    ],
    { maxBuffer: 8 * 1024 * 1024 },
  )
  return stdout
    .split(/\r?\n/u)
    .filter((line) => line.length > 0)
    .map(jsonLineParse)
    .filter((entry): entry is unknown => entry !== undefined)
}

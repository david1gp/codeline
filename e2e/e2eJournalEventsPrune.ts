import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { e2eRepositoryRoot } from "./e2eRepositoryRoot.js"

export type E2eJournalPruneResult = {
  prunedEventCount: number
  prunedThroughSequence: number | null
  userId: string
}

const execFileAsync = promisify(execFile)

/**
 * Runs the checked-in retention script so the replayable journal of the run's
 * synthetic members is exhausted through the production prune action. The
 * persisted replay boundary is what makes an already issued SSE cursor
 * unrecoverable, so the browser exercises the real server-emitted `reset`.
 */
export async function e2eJournalEventsPrune(runId: string): Promise<E2eJournalPruneResult[]> {
  const { stdout } = await execFileAsync("bun", ["scripts/e2eJournalEventsPrune.ts", runId], {
    cwd: e2eRepositoryRoot,
  })
  const parsed = JSON.parse(stdout) as { pruned: E2eJournalPruneResult[] }
  return parsed.pruned
}

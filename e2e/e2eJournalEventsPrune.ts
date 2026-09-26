import { execFile } from "node:child_process"
import { promisify } from "node:util"
import * as v from "valibot"
import { e2eFixtureContextResolve } from "./e2eFixtureContextResolve.js"
import { e2eFixtureRequest } from "./e2eFixtureRequest.js"
import { e2eRepositoryRoot } from "./e2eRepositoryRoot.js"

export type E2eJournalPruneResult = {
  prunedEventCount: number
  prunedThroughSequence: number | null
  userId: string
}

const execFileAsync = promisify(execFile)
const prunedSchema = v.object({
  exists: v.literal(true),
  pruned: v.array(
    v.object({
      prunedEventCount: v.number(),
      prunedThroughSequence: v.nullable(v.number()),
      userId: v.string(),
    }),
  ),
})

/**
 * Exhausts the replayable journal of verified run members through the fixture
 * API, without expiring their sessions. Only explicit legacy-local mode runs
 * the guarded SQLite script. The persisted boundary causes a real SSE reset.
 */
export async function e2eJournalEventsPrune(runId: string): Promise<E2eJournalPruneResult[]> {
  const context = await e2eFixtureContextResolve()
  if (context !== undefined) {
    if (!context.checkpoint.resourceIds.fixtureRunIds.includes(runId)) throw new Error("Unregistered E2E fixture run")
    const result = await e2eFixtureRequest(
      context.origin,
      context.token,
      `/${runId}/prune-journal`,
      prunedSchema,
      "POST",
    )
    return result.pruned
  }
  const { stdout } = await execFileAsync("bun", ["scripts/e2eJournalEventsPrune.ts", runId], {
    cwd: e2eRepositoryRoot,
  })
  const parsed = JSON.parse(stdout) as { pruned: E2eJournalPruneResult[] }
  return parsed.pruned
}

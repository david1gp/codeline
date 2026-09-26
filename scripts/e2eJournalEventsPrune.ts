import { like } from "drizzle-orm"
import { drizzle } from "drizzle-orm/libsql"
import { databasePath } from "../src/database/databasePath.js"
import { databaseSchema } from "../src/database/databaseSchema.js"
import { openLibsql } from "../src/database/openLibsql.js"
import { externalIdentityTable } from "../src/identity/db/externalIdentityTable.js"
import { journalEventsPrune } from "../src/journal/actions/journalEventsPrune.js"
import { e2eEnvironmentAssertLocal } from "./e2eEnvironmentAssertLocal.js"
import { e2eIdentitySubjectPrefixCreate } from "./e2eIdentitySubjectPrefixCreate.js"

/**
 * Expires the replayable journal of one end-to-end run's synthetic members by
 * running the production retention action with exhausted limits. The replay
 * boundary it persists is what makes a previously issued SSE cursor
 * unrecoverable, so the browser observes the real `reset` path instead of a
 * simulated one. It only ever targets subjects inside the end-to-end namespace
 * of the repository-managed local development database.
 */

const exhaustedLimits = { maxAgeMs: 0, maxCount: 0, maxSerializedBytes: 0 }

const runId = Bun.argv[2]
if (runId === undefined || !/^[0-9a-z]{6,40}$/.test(runId)) {
  console.error("A lowercase alphanumeric run identifier argument is required.")
  process.exit(1)
}

const environment = e2eEnvironmentAssertLocal()
if (!environment.success) {
  console.error(environment.errorMessage)
  process.exit(1)
}

const subjectPrefix = e2eIdentitySubjectPrefixCreate(runId)
const openedDatabase = openLibsql(databasePath)
const databaseClient = openedDatabase.$client
const database = drizzle(databaseClient, { schema: databaseSchema })

const identityRows = await database
  .select({ userId: externalIdentityTable.userId })
  .from(externalIdentityTable)
  .where(like(externalIdentityTable.subject, `${subjectPrefix}%`))
const userIds = [...new Set(identityRows.map((row) => row.userId))].sort()

const pruned: Array<{ prunedEventCount: number; prunedThroughSequence: number | null; userId: string }> = []
for (const userId of userIds) {
  const result = await journalEventsPrune({ clock: () => new Date(), database, limits: exhaustedLimits }, { userId })
  if (!result.success) {
    console.error(result.errorMessage)
    databaseClient.close()
    process.exit(1)
  }
  pruned.push({
    prunedEventCount: result.data.prunedEventCount,
    prunedThroughSequence: result.data.prunedThroughSequence,
    userId,
  })
}

databaseClient.close()
console.log(JSON.stringify({ pruned }))

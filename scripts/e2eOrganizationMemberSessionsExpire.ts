import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq, like } from "drizzle-orm"
import { drizzle } from "drizzle-orm/libsql"
import type { DatabaseExecutor } from "../src/database/databaseClient.js"
import { databasePath } from "../src/database/databasePath.js"
import { databaseSchema } from "../src/database/databaseSchema.js"
import { openLibsql } from "../src/database/openLibsql.js"
import { identitySessionExpire } from "../src/identity/actions/identitySessionExpire.js"
import { externalIdentityTable } from "../src/identity/db/externalIdentityTable.js"
import { identitySessionTable } from "../src/identity/db/identitySessionTable.js"
import { e2eEnvironmentAssertLocal } from "./e2eEnvironmentAssertLocal.js"
import { e2eIdentitySubjectPrefixCreate } from "./e2eIdentitySubjectPrefixCreate.js"

/**
 * Expires every identity session of one run-unique synthetic member through the
 * application expiry action, so an end-to-end run can age out an authenticated
 * identity deterministically instead of waiting out the real session lifetime or
 * writing one-off SQL. The member must carry the run's subject namespace and the
 * target must be the repository-managed local database, so no real session can
 * be reached.
 */

type ExpiredSession = {
  expiresAt: string
  sessionId: string
}

async function memberSessionsExpire(
  database: DatabaseExecutor,
  input: { expiresAt: Date; subjectPrefix: string; userId: string },
): Promise<Result<{ sessions: ExpiredSession[] }>> {
  const op = "memberSessionsExpire"

  const [identity] = await database
    .select({ subject: externalIdentityTable.subject })
    .from(externalIdentityTable)
    .where(
      and(
        eq(externalIdentityTable.userId, input.userId),
        like(externalIdentityTable.subject, `${input.subjectPrefix}%`),
      ),
    )
    .limit(1)
  if (identity === undefined) {
    return createResultError(op, "The end-to-end expiry refuses a user outside its own run namespace.")
  }

  const storedSessions = await database
    .select({ id: identitySessionTable.id })
    .from(identitySessionTable)
    .where(eq(identitySessionTable.userId, input.userId))

  const sessions: ExpiredSession[] = []
  for (const storedSession of storedSessions) {
    const expired = await identitySessionExpire(database, storedSession.id, { expiresAt: input.expiresAt })
    if (!expired.success) return expired
    sessions.push({ expiresAt: expired.data.expiresAt.toISOString(), sessionId: expired.data.id })
  }
  return createResult({ sessions })
}

const runId = Bun.argv[2]
if (runId === undefined || !/^[0-9a-z]{6,40}$/.test(runId)) {
  console.error("A lowercase alphanumeric run identifier argument is required.")
  process.exit(1)
}

const userId = Bun.argv[3]
if (userId === undefined || userId.length === 0) {
  console.error("An application user identifier argument is required.")
  process.exit(1)
}

const environment = e2eEnvironmentAssertLocal()
if (!environment.success) {
  console.error(environment.errorMessage)
  process.exit(1)
}

// One second before the issuing instant, so the expiry predicate rejects the
// session on the very next request without depending on clock resolution.
const expiresAt = new Date(Date.now() - 1_000)
const openedDatabase = openLibsql(databasePath)
const databaseClient = openedDatabase.$client
const database = drizzle(databaseClient, { schema: databaseSchema })
const expired = await memberSessionsExpire(database, {
  expiresAt,
  subjectPrefix: e2eIdentitySubjectPrefixCreate(runId),
  userId,
})
databaseClient.close()

if (!expired.success) {
  console.error(expired.errorMessage)
  process.exit(1)
}

console.log(JSON.stringify({ sessions: expired.data.sessions }))

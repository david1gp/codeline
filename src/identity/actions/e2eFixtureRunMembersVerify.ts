import { inArray } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { applicationUserTable } from "../db/applicationUserTable.js"
import { e2eFixtureRunTable } from "../db/e2eFixtureRunTable.js"
import { externalIdentityTable } from "../db/externalIdentityTable.js"
import { organizationMemberTable } from "../db/organizationMemberTable.js"

/** A run marker alone (or a matching name) never establishes fixture membership. */
export async function e2eFixtureRunMembersVerify(
  database: DatabaseExecutor,
  run: typeof e2eFixtureRunTable.$inferSelect,
): Promise<boolean> {
  const userIds = [run.firstUserId, run.secondUserId]
  if (!/^[0-9a-z]{6,40}$/.test(run.runId) || userIds[0] === userIds[1]) return false
  const users = await database.select().from(applicationUserTable).where(inArray(applicationUserTable.id, userIds))
  const identities = await database
    .select()
    .from(externalIdentityTable)
    .where(inArray(externalIdentityTable.userId, userIds))
  const memberships = await database
    .select()
    .from(organizationMemberTable)
    .where(inArray(organizationMemberTable.userId, userIds))
  if (users.length !== 2 || identities.length !== 2 || memberships.length !== 2) return false
  return userIds.every((userId, index) => {
    const subject = `e2e-organization-member-${run.runId}-${index + 1}`
    const user = users.find((row) => row.id === userId)
    const identity = identities.find((row) => row.userId === userId)
    const membership = memberships.find((row) => row.userId === userId)
    return (
      user?.displayName === `E2E Member ${index + 1} ${run.runId}` &&
      user.email === `${subject}@example.test` &&
      user.createdAt.getTime() >= run.createdAt.getTime() - 1000 &&
      identity?.issuer === run.issuer &&
      identity.subject === subject &&
      membership?.issuer === run.issuer &&
      membership.subject === subject &&
      membership.organizationId === run.organizationId
    )
  })
}

import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { inArray, like, or } from "drizzle-orm"
import type { DatabaseExecutor } from "../src/database/databaseClient.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { externalIdentityTable } from "../src/identity/db/externalIdentityTable.js"
import { organizationMemberTable } from "../src/identity/db/organizationMemberTable.js"

/**
 * Removes every synthetic identity of one end-to-end run. Deleting the user rows
 * cascades to external identities, memberships, identity sessions, notes, runs,
 * attempts, delegations, conversations, messages, and stream rows, so no
 * generated data survives a run, including one that failed mid-assertion.
 */
export async function e2eIdentityRunPurge(
  database: Pick<DatabaseExecutor, "delete" | "select">,
  subjectPrefix: string,
): Promise<Result<{ deletedUserIds: string[] }>> {
  const op = "e2eIdentityRunPurge"
  if (!subjectPrefix.startsWith("e2e-organization-member-")) {
    return createResultError(op, "The end-to-end purge refuses a subject prefix outside its own namespace.")
  }
  const subjectPattern = `${subjectPrefix}%`

  try {
    const identityRows = await database
      .select({ userId: externalIdentityTable.userId })
      .from(externalIdentityTable)
      .where(like(externalIdentityTable.subject, subjectPattern))
    const membershipRows = await database
      .select({ userId: organizationMemberTable.userId })
      .from(organizationMemberTable)
      .where(like(organizationMemberTable.subject, subjectPattern))
    const userIds = [...new Set([...identityRows, ...membershipRows].map((row) => row.userId))]

    // Membership and identity rows are removed explicitly as well, so a partially
    // created identity without a user row cannot outlive the run either.
    await database
      .delete(organizationMemberTable)
      .where(
        userIds.length === 0
          ? like(organizationMemberTable.subject, subjectPattern)
          : or(like(organizationMemberTable.subject, subjectPattern), inArray(organizationMemberTable.userId, userIds)),
      )
    await database.delete(externalIdentityTable).where(like(externalIdentityTable.subject, subjectPattern))
    if (userIds.length > 0) {
      await database.delete(applicationUserTable).where(inArray(applicationUserTable.id, userIds))
    }
    return createResult({ deletedUserIds: userIds })
  } catch (_error) {
    return createResultError(op, "The end-to-end identities could not be removed.")
  }
}

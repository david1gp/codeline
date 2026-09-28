import { createResult, createResultError } from "@adaptive-ds/result"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { databaseTransactionRun } from "../../database/databaseTransactionRun.js"
import { projectFolderBootstrapEnsure } from "../../project/db/projectFolderBootstrapEnsure.js"
import { applicationUserUpsert } from "../db/applicationUserUpsert.js"
import { organizationMemberTable } from "../db/organizationMemberTable.js"
import { organizationTable } from "../db/organizationTable.js"

// Internal identities for this user's private database; never OIDC or development impersonation.
export async function localRuntimeIdentityProvision(database: DatabaseClient) {
  const op = "localRuntimeIdentityProvision"
  return databaseTransactionRun(database, async (transaction) => {
    const user = await applicationUserUpsert(transaction, { id: "local:user", displayName: "Local User" })
    if (!user.success) return user
    const folder = await projectFolderBootstrapEnsure(transaction, user.data.id)
    if (!folder.success) return folder
    try {
      await transaction
        .insert(organizationTable)
        .values({ id: "local:organization", externalId: "urn:codeline:local", name: "Local" })
        .onConflictDoNothing({ target: organizationTable.id })
      await transaction
        .insert(organizationMemberTable)
        .values({
          organizationId: "local:organization",
          userId: user.data.id,
          issuer: "urn:codeline:local",
          subject: "user",
        })
        .onConflictDoNothing({ target: [organizationMemberTable.organizationId, organizationMemberTable.userId] })
    } catch {
      return createResultError(op, "The local organization membership could not be provisioned.")
    }
    return createResult({ userId: user.data.id, organizationId: "local:organization" })
  })
}

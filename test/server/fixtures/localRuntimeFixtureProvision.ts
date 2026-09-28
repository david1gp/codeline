import { createResult } from "@adaptive-ds/result"
import type { DatabaseClient } from "../../../src/database/databaseClient.js"
import { databaseTransactionRun } from "../../../src/database/databaseTransactionRun.js"
import { applicationUserUpsert } from "../../../src/identity/db/applicationUserUpsert.js"
import { organizationMemberTable } from "../../../src/identity/db/organizationMemberTable.js"
import { organizationTable } from "../../../src/identity/db/organizationTable.js"
import { projectFolderBootstrapEnsure } from "../../../src/project/db/projectFolderBootstrapEnsure.js"

// Deterministic test-only persisted identities, not development auth or OIDC provisioning.
export function localRuntimeFixtureProvision(database: DatabaseClient) {
  return databaseTransactionRun(database, async (transaction) => {
    for (const user of [
      { id: "local:fixture", displayName: "Local Fixture" },
      { id: "local:other", displayName: "Other Fixture" },
    ]) {
      const stored = await applicationUserUpsert(transaction, user)
      if (!stored.success) return stored
      const bootstrapped = await projectFolderBootstrapEnsure(transaction, user.id)
      if (!bootstrapped.success) return bootstrapped
    }
    await transaction.insert(organizationTable).values([
      { id: "local:organization", externalId: "local-fixture", name: "Local Fixture" },
      { id: "local:other-organization", externalId: "other-fixture", name: "Other Fixture" },
    ])
    await transaction.insert(organizationMemberTable).values([
      {
        organizationId: "local:organization",
        userId: "local:fixture",
        issuer: "urn:codeline:local",
        subject: "fixture",
      },
      {
        organizationId: "local:other-organization",
        userId: "local:fixture",
        issuer: "urn:codeline:local",
        subject: "fixture",
      },
      { organizationId: "local:organization", userId: "local:other", issuer: "urn:codeline:local", subject: "other" },
    ])
    return createResult({
      identity: { userId: "local:fixture", organizationId: "local:organization" },
      otherIdentity: { userId: "local:other", organizationId: "local:organization" },
    })
  })
}

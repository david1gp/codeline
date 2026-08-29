import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { projectFolderBootstrapEnsure } from "../../project/db/projectFolderBootstrapEnsure.js"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import type { ApplicationUser } from "./applicationUserTable.js"
import { applicationUserUpsert } from "./applicationUserUpsert.js"
import { externalIdentityUpsert } from "./externalIdentityUpsert.js"

type DevelopmentIdentity = {
  email?: string
  identityKey: string
  displayName: string
}

export async function developmentIdentityUpsert(
  database: DatabaseExecutor,
  identity: DevelopmentIdentity,
): Promise<Result<ApplicationUser>> {
  const op = "developmentIdentityUpsert"
  const issuer = "urn:codeline:development"

  try {
    const user = await applicationUserUpsert(database, {
      id: `development:${identity.identityKey}`,
      displayName: identity.displayName,
      email: identity.email,
    })
    if (!user.success) return createResultError(op, "The development identity could not be stored.")

    const bootstrapped = await projectFolderBootstrapEnsure(database, user.data.id)
    if (!bootstrapped.success) return createResultError(op, bootstrapped.errorMessage)

    const storedIdentity = await externalIdentityUpsert(database, {
      userId: user.data.id,
      issuer,
      subject: identity.identityKey,
    })
    if (storedIdentity.success) return createResult(user.data)
    return createResultError(op, storedIdentity.errorMessage)
  } catch (_error) {
    return createResultError(op, "The development identity could not be stored.")
  }
}

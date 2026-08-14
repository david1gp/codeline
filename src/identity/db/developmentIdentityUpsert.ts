import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { applicationUserUpsert } from "./applicationUserUpsert.js"
import type { ApplicationUser } from "./applicationUserTable.js"
import { externalIdentityUpsert } from "./externalIdentityUpsert.js"

type DevelopmentIdentity = {
  email?: string
  identityKey: string
  displayName: string
}

export async function developmentIdentityUpsert(
  database: Pick<DatabaseClient, "insert" | "query">,
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

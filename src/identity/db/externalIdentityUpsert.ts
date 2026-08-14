import { createHash } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { externalIdentityTable } from "./externalIdentityTable.js"

type ExternalIdentityInput = {
  userId: string
  issuer: string
  subject: string
}

type ExternalIdentity = typeof externalIdentityTable.$inferSelect

export async function externalIdentityUpsert(
  database: Pick<DatabaseClient, "insert" | "query">,
  identity: ExternalIdentityInput,
): Promise<Result<ExternalIdentity>> {
  const op = "externalIdentityUpsert"
  const id = `external:${createHash("sha256").update(`${identity.issuer}\0${identity.subject}`).digest("hex")}`

  try {
    const [storedIdentity] = await database
      .insert(externalIdentityTable)
      .values({ id, userId: identity.userId, issuer: identity.issuer, subject: identity.subject })
      .onConflictDoNothing({ target: [externalIdentityTable.issuer, externalIdentityTable.subject] })
      .returning()
    if (storedIdentity !== undefined) return createResult(storedIdentity)

    const existingIdentity = await database.query.externalIdentityTable.findFirst({
      where: and(
        eq(externalIdentityTable.issuer, identity.issuer),
        eq(externalIdentityTable.subject, identity.subject),
      ),
    })
    if (existingIdentity?.userId === identity.userId) return createResult(existingIdentity)
    return createResultError(op, "The external identity is already linked to another user.")
  } catch (_error) {
    return createResultError(op, "The external identity could not be stored.")
  }
}

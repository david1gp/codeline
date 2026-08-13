import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { eq } from "drizzle-orm"
import type { DatabaseClient } from "../databaseClient.js"
import { developmentUserTable } from "../schema/developmentUserTable.js"

export type DevelopmentIdentity = {
  email?: string
  identityKey: string
  displayName: string
}

export type DevelopmentUser = typeof developmentUserTable.$inferSelect

export async function developmentUserUpsert(
  database: Pick<DatabaseClient, "insert" | "query">,
  identity: DevelopmentIdentity,
): Promise<Result<DevelopmentUser>> {
  const op = "developmentUserUpsert"

  try {
    const [user] = await database
      .insert(developmentUserTable)
      .values({
        id: `development:${identity.identityKey}`,
        identityKey: identity.identityKey,
        displayName: identity.displayName,
        email: identity.email,
      })
      .onConflictDoUpdate({
        set: {
          displayName: identity.displayName,
          email: identity.email,
          updatedAt: new Date(),
        },
        target: developmentUserTable.identityKey,
      })
      .returning()

    if (user !== undefined) return createResult(user)

    const existing = await database.query.developmentUserTable.findFirst({
      where: eq(developmentUserTable.identityKey, identity.identityKey),
    })
    if (existing !== undefined) return createResult(existing)
    return createResultError(op, "The development identity could not be stored.")
  } catch (_error) {
    return createResultError(op, "The development identity could not be stored.")
  }
}

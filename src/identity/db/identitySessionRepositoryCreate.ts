import { createHash } from "node:crypto"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { identitySessionTable } from "./identitySessionTable.js"

type IdentitySessionInput = {
  id: string
  userId: string
  token: string
  expiresAt: Date
}

export async function identitySessionRepositoryCreate(
  database: Pick<DatabaseExecutor, "insert">,
  session: IdentitySessionInput,
): Promise<Result<typeof identitySessionTable.$inferSelect>> {
  const op = "identitySessionRepositoryCreate"

  try {
    const [storedSession] = await database
      .insert(identitySessionTable)
      .values({
        id: session.id,
        userId: session.userId,
        tokenHash: createHash("sha256").update(session.token).digest("hex"),
        expiresAt: session.expiresAt,
      })
      .returning()
    if (storedSession !== undefined) return createResult(storedSession)
    return createResultError(op, "The identity session could not be stored.")
  } catch (_error) {
    return createResultError(op, "The identity session could not be stored.")
  }
}

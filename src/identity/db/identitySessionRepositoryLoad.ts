import { createHash } from "node:crypto"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq, gt, isNull } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { identitySessionTable } from "./identitySessionTable.js"

export async function identitySessionRepositoryLoad(
  database: Pick<DatabaseExecutor, "query">,
  token: string,
  now: Date = new Date(),
): Promise<Result<typeof identitySessionTable.$inferSelect | undefined>> {
  const op = "identitySessionRepositoryLoad"

  try {
    const session = await database.query.identitySessionTable.findFirst({
      where: and(
        eq(identitySessionTable.tokenHash, createHash("sha256").update(token).digest("hex")),
        isNull(identitySessionTable.revokedAt),
        gt(identitySessionTable.expiresAt, now),
      ),
    })
    return createResult(session)
  } catch (_error) {
    return createResultError(op, "The identity session could not be resolved.")
  }
}

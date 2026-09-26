import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { organizationMemberTable } from "../../identity/db/organizationMemberTable.js"

export async function noteOrganizationAuthorize(
  database: DatabaseExecutor,
  userId: string,
  organizationId: string | undefined,
): Promise<Result<void>> {
  const op = "noteOrganizationAuthorize"
  if (organizationId === undefined) return createResult(undefined)

  try {
    const [membership] = await database
      .select({ userId: organizationMemberTable.userId })
      .from(organizationMemberTable)
      .where(
        and(eq(organizationMemberTable.organizationId, organizationId), eq(organizationMemberTable.userId, userId)),
      )
      .limit(1)
    if (membership === undefined) return createResultError(op, "The note could not be authorized.")
    return createResult(undefined)
  } catch (_error) {
    return createResultError(op, "The note could not be authorized.")
  }
}

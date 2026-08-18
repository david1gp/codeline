import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { type OrganizationMember, organizationMemberTable } from "./organizationMemberTable.js"
import { organizationTable } from "./organizationTable.js"

export async function organizationMemberRepositoryLoad(
  database: Pick<DatabaseExecutor, "query">,
  userId: string,
  organizationExternalId?: string,
  issuer?: string,
): Promise<Result<OrganizationMember | undefined>> {
  const op = "organizationMemberRepositoryLoad"

  try {
    if (organizationExternalId !== undefined || issuer !== undefined) {
      if (organizationExternalId === undefined || issuer === undefined) return createResult(undefined)

      const organization = await database.query.organizationTable.findFirst({
        where: eq(organizationTable.externalId, organizationExternalId),
      })
      if (organization === undefined) return createResult(undefined)

      const membership = await database.query.organizationMemberTable.findFirst({
        where: and(
          eq(organizationMemberTable.organizationId, organization.id),
          eq(organizationMemberTable.userId, userId),
          eq(organizationMemberTable.issuer, issuer),
        ),
      })
      return createResult(membership)
    }

    const memberships = await database.query.organizationMemberTable.findMany({
      where: eq(organizationMemberTable.userId, userId),
    })
    return createResult(memberships.length === 1 ? memberships[0] : undefined)
  } catch (_error) {
    return createResultError(op, "The organization membership could not be loaded.")
  }
}

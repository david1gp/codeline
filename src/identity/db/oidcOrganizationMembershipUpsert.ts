import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { eq } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { type OrganizationMember, organizationMemberTable } from "./organizationMemberTable.js"
import { organizationTable } from "./organizationTable.js"

type OidcOrganizationMembership = {
  organizationExternalId: string
  issuer: string
  subject: string
  userId: string
}

export async function oidcOrganizationMembershipUpsert(
  database: Pick<DatabaseExecutor, "insert" | "query">,
  membership: OidcOrganizationMembership,
): Promise<Result<OrganizationMember>> {
  const op = "oidcOrganizationMembershipUpsert"

  try {
    const organization = await database.query.organizationTable.findFirst({
      where: eq(organizationTable.externalId, membership.organizationExternalId),
    })
    if (organization === undefined) return createResultError(op, "The OIDC organization is not configured.")

    const [storedMembership] = await database
      .insert(organizationMemberTable)
      .values({
        issuer: membership.issuer,
        organizationId: organization.id,
        subject: membership.subject,
        userId: membership.userId,
      })
      .onConflictDoUpdate({
        set: {
          issuer: membership.issuer,
          subject: membership.subject,
          updatedAt: new Date(),
        },
        target: [organizationMemberTable.organizationId, organizationMemberTable.userId],
      })
      .returning()
    if (storedMembership === undefined)
      return createResultError(op, "The OIDC organization membership could not be stored.")
    return createResult(storedMembership)
  } catch (_error) {
    return createResultError(op, "The OIDC organization membership could not be stored.")
  }
}

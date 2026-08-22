import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericQueryCtx } from "convex/server"

type OrganizationMember = {
  _creationTime: number
  _id: string
  createdAt: number
  issuer: string
  organizationId: string
  subject: string
  updatedAt: number
  userId: string
}

export async function identityOrganizationMemberLoad(
  context: Pick<GenericQueryCtx<any>, "db">,
  userId: string,
  organizationExternalId?: string,
  issuer?: string,
): Promise<Result<OrganizationMember | undefined>> {
  const op = "identityOrganizationMemberLoad"

  try {
    if (organizationExternalId !== undefined || issuer !== undefined) {
      if (organizationExternalId === undefined || issuer === undefined) return createResult(undefined)
      const organization = await context.db
        .query("organizations")
        .withIndex("externalId", (query: any) => query.eq("externalId", organizationExternalId))
        .first()
      if (organization === null) return createResult(undefined)
      const membership = await context.db
        .query("organizationMembers")
        .withIndex("organizationIdentity", (query: any) =>
          query.eq("organizationId", organization.id).eq("issuer", issuer),
        )
        .filter((query: any) => query.eq(query.field("userId"), userId))
        .first()
      return createResult(membership === null ? undefined : (membership as OrganizationMember))
    }

    const memberships = await context.db
      .query("organizationMembers")
      .withIndex("userId", (query: any) => query.eq("userId", userId))
      .take(2)
    return createResult(memberships.length === 1 ? (memberships[0] as OrganizationMember) : undefined)
  } catch (_error) {
    return createResultError(op, "The organization membership could not be loaded.")
  }
}

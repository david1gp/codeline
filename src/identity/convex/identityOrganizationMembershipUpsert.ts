import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericMutationCtx } from "convex/server"

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

type OrganizationMembershipInput = {
  issuer: string
  organizationExternalId: string
  now: number
  subject: string
  userId: string
}

export async function identityOrganizationMembershipUpsert(
  context: Pick<GenericMutationCtx<any>, "db">,
  input: OrganizationMembershipInput,
): Promise<Result<OrganizationMember>> {
  const op = "identityOrganizationMembershipUpsert"

  try {
    const organization = await context.db
      .query("organizations")
      .withIndex("externalId", (query: any) => query.eq("externalId", input.organizationExternalId))
      .first()
    if (organization === null) return createResultError(op, "The OIDC organization is not configured.")

    const existingIdentity = await context.db
      .query("organizationMembers")
      .withIndex("organizationIdentity", (query: any) =>
        query.eq("organizationId", organization.id).eq("issuer", input.issuer).eq("subject", input.subject),
      )
      .first()
    if (existingIdentity !== null && existingIdentity.userId !== input.userId) {
      return createResultError(op, "The OIDC identity is already a member of another user.")
    }

    const existingMembership = await context.db
      .query("organizationMembers")
      .withIndex("organizationIdUserId", (query: any) =>
        query.eq("organizationId", organization.id).eq("userId", input.userId),
      )
      .first()
    if (existingMembership !== null) {
      await context.db.patch("organizationMembers", existingMembership._id, {
        issuer: input.issuer,
        subject: input.subject,
        updatedAt: input.now,
      })
      return createResult({
        ...(existingMembership as OrganizationMember),
        issuer: input.issuer,
        subject: input.subject,
        updatedAt: input.now,
      })
    }

    const documentId = await context.db.insert("organizationMembers", {
      organizationId: organization.id,
      userId: input.userId,
      issuer: input.issuer,
      subject: input.subject,
      createdAt: input.now,
      updatedAt: input.now,
    })
    return createResult({
      _creationTime: input.now,
      _id: documentId,
      createdAt: input.now,
      issuer: input.issuer,
      organizationId: organization.id,
      subject: input.subject,
      updatedAt: input.now,
      userId: input.userId,
    })
  } catch (_error) {
    return createResultError(op, "The OIDC organization membership could not be stored.")
  }
}

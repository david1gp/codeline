import { createResultError, type Result } from "@adaptive-ds/result"
import { type GenericActionCtx, makeFunctionReference } from "convex/server"

type OrganizationMember = {
  issuer: string
  organizationId: string
  subject: string
  userId: string
}

const identityOrganizationMemberResolveReference = makeFunctionReference<
  "query",
  { issuer?: string; organizationExternalId?: string; token: string },
  Result<OrganizationMember>
>("identity:identityOrganizationMemberResolve")

export async function identityActionOrganizationMemberRequire(
  context: Pick<GenericActionCtx<any>, "runQuery">,
  token: string,
  organizationExternalId?: string,
  issuer?: string,
): Promise<Result<OrganizationMember>> {
  const op = "identityActionOrganizationMemberRequire"
  try {
    const membership = await context.runQuery(identityOrganizationMemberResolveReference, {
      ...(issuer === undefined ? {} : { issuer }),
      ...(organizationExternalId === undefined ? {} : { organizationExternalId }),
      token,
    })
    if (!membership.success) return createResultError(op, membership.errorMessage)
    return membership
  } catch (_error) {
    return createResultError(op, "Organization membership is required.")
  }
}

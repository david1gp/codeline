import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericQueryCtx } from "convex/server"
import { identityOrganizationMemberLoad } from "./identityOrganizationMemberLoad.js"
import { identitySessionResolve } from "./identitySessionResolve.js"

type OrganizationMember = {
  issuer: string
  organizationId: string
  subject: string
  userId: string
}

export async function identityOrganizationMemberRequire(
  context: Pick<GenericQueryCtx<any>, "db">,
  token: string,
  organizationExternalId?: string,
  issuer?: string,
): Promise<Result<OrganizationMember>> {
  const op = "identityOrganizationMemberRequire"
  const session = await identitySessionResolve(context, token)
  if (!session.success) return createResultError(op, session.errorMessage)
  if (session.data === undefined) return createResultError(op, "Authentication is required.")

  const membership = await identityOrganizationMemberLoad(context, session.data.userId, organizationExternalId, issuer)
  if (!membership.success) return createResultError(op, membership.errorMessage)
  if (membership.data === undefined) return createResultError(op, "Organization membership is required.")
  return createResult({
    issuer: membership.data.issuer,
    organizationId: membership.data.organizationId,
    subject: membership.data.subject,
    userId: membership.data.userId,
  })
}

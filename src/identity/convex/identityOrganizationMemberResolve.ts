import type { GenericQueryCtx } from "convex/server"
import { identityOrganizationMemberRequire } from "./identityOrganizationMemberRequire.js"

export function identityOrganizationMemberResolve(
  context: Pick<GenericQueryCtx<any>, "db">,
  token: string,
  organizationExternalId?: string,
  issuer?: string,
) {
  return identityOrganizationMemberRequire(context, token, organizationExternalId, issuer)
}

import type { GenericQueryCtx } from "convex/server"
import { identityOrganizationMemberLoad } from "./identityOrganizationMemberLoad.js"

export function identityDevelopmentOrganizationMemberResolve(
  context: Pick<GenericQueryCtx<any>, "db">,
  identityKey: string,
  organizationExternalId: string,
  issuer: string,
) {
  return identityOrganizationMemberLoad(context, `development:${identityKey}`, organizationExternalId, issuer)
}

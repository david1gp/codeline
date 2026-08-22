import type { GenericQueryCtx } from "convex/server"
import { identityOrganizationOwnsRequire } from "./identityOrganizationOwnsRequire.js"

export function identityOrganizationOwnsResolve(
  context: Pick<GenericQueryCtx<any>, "db">,
  token: string,
  organizationId: string,
) {
  return identityOrganizationOwnsRequire(context, token, organizationId)
}

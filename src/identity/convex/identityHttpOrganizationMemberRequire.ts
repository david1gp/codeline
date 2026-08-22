import type { GenericActionCtx } from "convex/server"
import { identityActionOrganizationMemberRequire } from "./identityActionOrganizationMemberRequire.js"
import { identitySessionTokenRead } from "./identitySessionTokenRead.js"

export function identityHttpOrganizationMemberRequire(
  context: Pick<GenericActionCtx<any>, "runQuery">,
  request: Request,
  organizationExternalId?: string,
  issuer?: string,
) {
  const token = identitySessionTokenRead(request)
  if (token === undefined) return identityActionOrganizationMemberRequireMissing()
  return identityActionOrganizationMemberRequire(context, token, organizationExternalId, issuer)
}

async function identityActionOrganizationMemberRequireMissing() {
  return {
    success: false as const,
    op: "identityHttpOrganizationMemberRequire",
    errorMessage: "Organization membership is required.",
  }
}

import type { GenericActionCtx } from "convex/server"
import { identityActionOrganizationOwnsRequire } from "./identityActionOrganizationOwnsRequire.js"
import { identitySessionTokenRead } from "./identitySessionTokenRead.js"

export function identityHttpOrganizationOwnsRequire(
  context: Pick<GenericActionCtx<any>, "runQuery">,
  request: Request,
  organizationId: string,
) {
  const token = identitySessionTokenRead(request)
  if (token === undefined) return identityOrganizationMissing()
  return identityActionOrganizationOwnsRequire(context, token, organizationId)
}

async function identityOrganizationMissing() {
  return {
    success: false as const,
    op: "identityHttpOrganizationOwnsRequire",
    errorMessage: "Organization membership is required.",
  }
}

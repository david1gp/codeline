import { createResultError, type Result } from "@adaptive-ds/result"
import { type GenericActionCtx, makeFunctionReference } from "convex/server"

const identityOrganizationOwnsResolveReference = makeFunctionReference<
  "query",
  { organizationId: string; token: string },
  Result<void>
>("identity:identityOrganizationOwnsResolve")

export async function identityActionOrganizationOwnsRequire(
  context: Pick<GenericActionCtx<any>, "runQuery">,
  token: string,
  organizationId: string,
): Promise<Result<void>> {
  const op = "identityActionOrganizationOwnsRequire"
  try {
    const ownership = await context.runQuery(identityOrganizationOwnsResolveReference, { organizationId, token })
    if (!ownership.success) return createResultError(op, ownership.errorMessage)
    return ownership
  } catch (_error) {
    return createResultError(op, "Organization membership is required.")
  }
}

import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericQueryCtx } from "convex/server"
import { identitySessionResolve } from "./identitySessionResolve.js"

export async function identityOrganizationOwnsRequire(
  context: Pick<GenericQueryCtx<any>, "db">,
  token: string,
  organizationId: string,
): Promise<Result<void>> {
  const op = "identityOrganizationOwnsRequire"
  const session = await identitySessionResolve(context, token)
  if (!session.success) return createResultError(op, session.errorMessage)
  if (session.data === undefined) return createResultError(op, "Authentication is required.")
  const userId = session.data.userId
  const membership = await context.db
    .query("organizationMembers")
    .withIndex("organizationIdUserId", (query: any) => query.eq("organizationId", organizationId).eq("userId", userId))
    .first()
  if (membership === null) return createResultError(op, "Organization membership is required.")
  return createResult(undefined)
}

import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericQueryCtx } from "convex/server"
import { identityUserRequire } from "./identityUserRequire.js"

export async function identityUserOwnsRequire(
  context: Pick<GenericQueryCtx<any>, "db">,
  token: string,
  userId: string,
): Promise<Result<void>> {
  const op = "identityUserOwnsRequire"
  const identity = await identityUserRequire(context, token)
  if (!identity.success) return createResultError(op, identity.errorMessage)
  if (identity.data.userId !== userId) return createResultError(op, "The requested user is not accessible.")
  return createResult(undefined)
}

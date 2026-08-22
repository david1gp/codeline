import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericActionCtx } from "convex/server"
import { identityActionUserRequire } from "./identityActionUserRequire.js"

export async function identityActionUserOwnsRequire(
  context: Pick<GenericActionCtx<any>, "runQuery">,
  token: string,
  userId: string,
): Promise<Result<void>> {
  const op = "identityActionUserOwnsRequire"
  const identity = await identityActionUserRequire(context, token)
  if (!identity.success) return createResultError(op, identity.errorMessage)
  if (identity.data.userId !== userId) return createResultError(op, "The requested user is not accessible.")
  return createResult(undefined)
}

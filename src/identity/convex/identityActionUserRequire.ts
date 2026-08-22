import { createResultError, type Result } from "@adaptive-ds/result"
import { type GenericActionCtx, makeFunctionReference } from "convex/server"

type ResolvedIdentity = {
  sessionId: string
  user: {
    createdAt: number
    displayName: string
    email?: string
    id: string
    updatedAt: number
  }
  userId: string
}

const identityUserResolveReference = makeFunctionReference<"query", { token: string }, Result<ResolvedIdentity>>(
  "identity:identityUserResolve",
)

export async function identityActionUserRequire(
  context: Pick<GenericActionCtx<any>, "runQuery">,
  token: string,
): Promise<Result<ResolvedIdentity>> {
  const op = "identityActionUserRequire"
  try {
    const identity = await context.runQuery(identityUserResolveReference, { token })
    if (!identity.success) return createResultError(op, identity.errorMessage)
    return identity
  } catch (_error) {
    return createResultError(op, "Authentication is required.")
  }
}

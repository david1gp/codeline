import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericMutationCtx } from "convex/server"
import { identitySessionResolve } from "./identitySessionResolve.js"
import { identitySessionRevoke } from "./identitySessionRevoke.js"

type IdentitySession = {
  _creationTime: number
  _id: string
  createdAt: number
  expiresAt: number
  id: string
  lastUsedAt?: number
  revokedAt?: number
  tokenHash: string
  userId: string
}

export async function identitySessionRevokeForToken(
  context: Pick<GenericMutationCtx<any>, "db">,
  token: string,
  now = Date.now(),
): Promise<Result<IdentitySession | undefined>> {
  const op = "identitySessionRevokeForToken"
  const session = await identitySessionResolve(context, token, now)
  if (!session.success) return createResultError(op, session.errorMessage)
  if (session.data === undefined) return createResult(undefined)
  return identitySessionRevoke(context, session.data.id, now)
}

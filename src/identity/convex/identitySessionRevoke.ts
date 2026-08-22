import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericMutationCtx } from "convex/server"

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

export async function identitySessionRevoke(
  context: Pick<GenericMutationCtx<any>, "db">,
  sessionId: string,
  now = Date.now(),
): Promise<Result<IdentitySession>> {
  const op = "identitySessionRevoke"

  try {
    const session = await context.db
      .query("identitySessions")
      .withIndex("id", (query: any) => query.eq("id", sessionId))
      .first()
    if (session === null) return createResultError(op, "The identity session could not be found.")
    if (session.revokedAt !== undefined) return createResult(session as IdentitySession)
    await context.db.patch("identitySessions", session._id, { revokedAt: now })
    return createResult({ ...(session as IdentitySession), revokedAt: now })
  } catch (_error) {
    return createResultError(op, "The identity session could not be revoked.")
  }
}

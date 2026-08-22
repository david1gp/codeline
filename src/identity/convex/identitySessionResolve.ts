import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericQueryCtx } from "convex/server"
import { identitySecretHash } from "./identitySecretHash.js"

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

export async function identitySessionResolve(
  context: Pick<GenericQueryCtx<any>, "db">,
  token: string,
  now = Date.now(),
): Promise<Result<IdentitySession | undefined>> {
  const op = "identitySessionResolve"
  if (token.length === 0) return createResult(undefined)

  try {
    const tokenHash = await identitySecretHash(token)
    const session = await context.db
      .query("identitySessions")
      .withIndex("tokenHash", (query: any) => query.eq("tokenHash", tokenHash))
      .first()
    if (session === null) return createResult(undefined)
    const storedSession = session as IdentitySession
    if (storedSession.revokedAt !== undefined || storedSession.expiresAt <= now) return createResult(undefined)
    return createResult(storedSession)
  } catch (_error) {
    return createResultError(op, "The identity session could not be resolved.")
  }
}

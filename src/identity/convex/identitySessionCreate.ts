import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericMutationCtx } from "convex/server"
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

type IdentitySessionInput = {
  expiresAt: number
  id: string
  now: number
  token: string
  userId: string
}

export async function identitySessionCreate(
  context: Pick<GenericMutationCtx<any>, "db">,
  input: IdentitySessionInput,
): Promise<Result<IdentitySession>> {
  const op = "identitySessionCreate"
  if (input.token.length === 0) return createResultError(op, "The identity session token is invalid.")

  try {
    const user = await context.db
      .query("users")
      .withIndex("id", (query: any) => query.eq("id", input.userId))
      .first()
    if (user === null) return createResultError(op, "The identity session user could not be found.")

    const existingId = await context.db
      .query("identitySessions")
      .withIndex("id", (query: any) => query.eq("id", input.id))
      .first()
    if (existingId !== null) return createResultError(op, "The identity session ID is already in use.")

    const tokenHash = await identitySecretHash(input.token)
    const existingSession = await context.db
      .query("identitySessions")
      .withIndex("tokenHash", (query: any) => query.eq("tokenHash", tokenHash))
      .first()
    if (existingSession !== null) return createResultError(op, "The identity session token is already in use.")

    const documentId = await context.db.insert("identitySessions", {
      id: input.id,
      userId: input.userId,
      tokenHash,
      expiresAt: input.expiresAt,
      createdAt: input.now,
    })
    return createResult({
      _creationTime: input.now,
      _id: documentId,
      createdAt: input.now,
      expiresAt: input.expiresAt,
      id: input.id,
      tokenHash,
      userId: input.userId,
    })
  } catch (_error) {
    return createResultError(op, "The identity session could not be stored.")
  }
}

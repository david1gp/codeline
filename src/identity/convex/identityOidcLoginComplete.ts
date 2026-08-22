import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericMutationCtx } from "convex/server"
import { identityOidcIdentityUpsert } from "./identityOidcIdentityUpsert.js"
import { identitySessionCreate } from "./identitySessionCreate.js"
import { identitySessionResolve } from "./identitySessionResolve.js"

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

type IdentityUser = {
  _creationTime: number
  _id: string
  createdAt: number
  displayName: string
  email?: string
  id: string
  updatedAt: number
}

type OidcIdentityProfile = {
  displayName?: string
  issuer: string
  organizationExternalId: string
  subject: string
  verifiedEmail?: string
}

type OidcLoginCompleteInput = {
  expiresAt: number
  id: string
  now: number
  presentedToken?: string
  profile: OidcIdentityProfile
  token: string
}

export async function identityOidcLoginComplete(
  context: Pick<GenericMutationCtx<any>, "db">,
  input: OidcLoginCompleteInput,
): Promise<Result<{ session: IdentitySession; token: string; user: IdentityUser }>> {
  const op = "identityOidcLoginComplete"
  const user = await identityOidcIdentityUpsert(context, input.profile, input.now)
  if (!user.success) return createResultError(op, user.errorMessage)

  if (input.presentedToken !== undefined) {
    const presentedSession = await identitySessionResolve(context, input.presentedToken, input.now)
    if (!presentedSession.success) return createResultError(op, presentedSession.errorMessage)
    if (presentedSession.data !== undefined) {
      await (context.db as any).patch("identitySessions", presentedSession.data._id, { revokedAt: input.now })
    }
  }

  const session = await identitySessionCreate(context, {
    expiresAt: input.expiresAt,
    id: input.id,
    now: input.now,
    token: input.token,
    userId: user.data.id,
  })
  if (!session.success) return createResultError(op, session.errorMessage)
  return createResult({ session: session.data, token: input.token, user: user.data })
}

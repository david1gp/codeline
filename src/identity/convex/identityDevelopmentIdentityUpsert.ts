import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericMutationCtx } from "convex/server"
import { identityExternalIdentityUpsert } from "./identityExternalIdentityUpsert.js"
import { identityUserUpsert } from "./identityUserUpsert.js"

type DevelopmentIdentity = {
  displayName: string
  email?: string
  identityKey: string
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

export async function identityDevelopmentIdentityUpsert(
  context: Pick<GenericMutationCtx<any>, "db">,
  identity: DevelopmentIdentity,
  now = Date.now(),
): Promise<Result<IdentityUser>> {
  const op = "identityDevelopmentIdentityUpsert"
  const user = await identityUserUpsert(context, {
    displayName: identity.displayName,
    ...(identity.email === undefined ? {} : { email: identity.email }),
    id: `development:${identity.identityKey}`,
    now,
  })
  if (!user.success) return createResultError(op, user.errorMessage)

  const externalIdentity = await identityExternalIdentityUpsert(context, {
    issuer: "urn:codeline:development",
    now,
    subject: identity.identityKey,
    userId: user.data.id,
  })
  if (!externalIdentity.success) return createResultError(op, externalIdentity.errorMessage)
  return createResult(user.data)
}

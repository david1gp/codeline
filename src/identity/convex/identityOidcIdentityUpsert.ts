import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericMutationCtx } from "convex/server"
import { identityExternalIdentityUpsert } from "./identityExternalIdentityUpsert.js"
import { identityOrganizationMembershipUpsert } from "./identityOrganizationMembershipUpsert.js"
import { identitySecretHash } from "./identitySecretHash.js"
import { identityUserLoad } from "./identityUserLoad.js"
import { identityUserUpsert } from "./identityUserUpsert.js"

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

export async function identityOidcIdentityUpsert(
  context: Pick<GenericMutationCtx<any>, "db">,
  profile: OidcIdentityProfile,
  now = Date.now(),
): Promise<Result<IdentityUser>> {
  const op = "identityOidcIdentityUpsert"

  try {
    const existingIdentity = await context.db
      .query("externalIdentities")
      .withIndex("issuerSubject", (query: any) => query.eq("issuer", profile.issuer).eq("subject", profile.subject))
      .first()
    const proposedUserId = `oidc:${await identitySecretHash(`${profile.issuer}\0${profile.subject}`)}`
    const userId = existingIdentity?.userId ?? proposedUserId
    const existingUser = await identityUserLoad(context, userId)
    if (!existingUser.success) return createResultError(op, existingUser.errorMessage)

    const user = await identityUserUpsert(context, {
      displayName: profile.displayName ?? existingUser.data?.displayName ?? profile.subject,
      ...(profile.verifiedEmail === undefined ? {} : { email: profile.verifiedEmail }),
      id: userId,
      now,
    })
    if (!user.success) return createResultError(op, user.errorMessage)

    const externalIdentity = await identityExternalIdentityUpsert(context, {
      issuer: profile.issuer,
      now,
      subject: profile.subject,
      userId,
    })
    if (!externalIdentity.success) return createResultError(op, externalIdentity.errorMessage)

    const membership = await identityOrganizationMembershipUpsert(context, {
      issuer: profile.issuer,
      organizationExternalId: profile.organizationExternalId,
      now,
      subject: profile.subject,
      userId,
    })
    if (!membership.success) return createResultError(op, membership.errorMessage)
    return createResult(user.data)
  } catch (_error) {
    return createResultError(op, "The OIDC identity could not be stored.")
  }
}

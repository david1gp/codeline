import { actionGeneric, internalMutationGeneric, mutationGeneric, queryGeneric } from "convex/server"
import { v } from "convex/values"
import { identityActionUserRequire } from "../src/identity/convex/identityActionUserRequire.js"
import { identityDevelopmentIdentityUpsert as developmentIdentityUpsert } from "../src/identity/convex/identityDevelopmentIdentityUpsert.js"
import { identityDevelopmentOrganizationMemberResolve as developmentOrganizationMemberResolve } from "../src/identity/convex/identityDevelopmentOrganizationMemberResolve.js"
import { identityExternalIdentityUpsert as externalIdentityUpsert } from "../src/identity/convex/identityExternalIdentityUpsert.js"
import { identityOidcIdentityUpsert as oidcIdentityUpsert } from "../src/identity/convex/identityOidcIdentityUpsert.js"
import { identityOidcLoginComplete as oidcLoginComplete } from "../src/identity/convex/identityOidcLoginComplete.js"
import { identityOidcLoginTransactionConsume as oidcLoginTransactionConsume } from "../src/identity/convex/identityOidcLoginTransactionConsume.js"
import { identityOidcLoginTransactionCreate as oidcLoginTransactionCreate } from "../src/identity/convex/identityOidcLoginTransactionCreate.js"
import { identityOrganizationMemberResolve as organizationMemberResolve } from "../src/identity/convex/identityOrganizationMemberResolve.js"
import { identityOrganizationMembershipUpsert as organizationMembershipUpsert } from "../src/identity/convex/identityOrganizationMembershipUpsert.js"
import { identityOrganizationOwnsResolve as organizationOwnsResolve } from "../src/identity/convex/identityOrganizationOwnsResolve.js"
import { identitySessionCreate as sessionCreate } from "../src/identity/convex/identitySessionCreate.js"
import { identitySessionResolve as sessionResolve } from "../src/identity/convex/identitySessionResolve.js"
import { identitySessionRevokeForToken as sessionRevokeForToken } from "../src/identity/convex/identitySessionRevokeForToken.js"
import { identityUserResolve as userResolve } from "../src/identity/convex/identityUserResolve.js"

export const identitySessionResolve = queryGeneric({
  args: { now: v.optional(v.number()), token: v.string() },
  handler: async (context, args) =>
    identityResultPublic(await sessionResolve(context, args.token, args.now ?? Date.now())),
})

export const identityUserResolve = queryGeneric({
  args: { token: v.string() },
  handler: (context, args) => userResolve(context, args.token),
})

export const identityOrganizationMemberResolve = queryGeneric({
  args: {
    issuer: v.optional(v.string()),
    organizationExternalId: v.optional(v.string()),
    token: v.string(),
  },
  handler: async (context, args) =>
    identityResultPublic(
      await organizationMemberResolve(context, args.token, args.organizationExternalId, args.issuer),
    ),
})

export const identityDevelopmentOrganizationMemberResolve = queryGeneric({
  args: { identityKey: v.string(), issuer: v.string(), organizationExternalId: v.string() },
  handler: async (context, args) =>
    identityResultPublic(
      await developmentOrganizationMemberResolve(context, args.identityKey, args.organizationExternalId, args.issuer),
    ),
})

export const identityOrganizationOwnsResolve = queryGeneric({
  args: { organizationId: v.string(), token: v.string() },
  handler: (context, args) => organizationOwnsResolve(context, args.token, args.organizationId),
})

export const identitySessionCreate = internalMutationGeneric({
  args: {
    expiresAt: v.number(),
    id: v.string(),
    now: v.number(),
    token: v.string(),
    userId: v.string(),
  },
  handler: async (context, args) => identityResultPublic(await sessionCreate(context, args)),
})

export const identitySessionRevoke = mutationGeneric({
  args: { now: v.optional(v.number()), token: v.string() },
  handler: async (context, args) =>
    identityResultPublic(await sessionRevokeForToken(context, args.token, args.now ?? Date.now())),
})

export const identityDevelopmentIdentityUpsert = mutationGeneric({
  args: {
    displayName: v.string(),
    email: v.optional(v.string()),
    identityKey: v.string(),
    now: v.optional(v.number()),
  },
  handler: async (context, args) =>
    identityResultPublic(
      await developmentIdentityUpsert(
        context,
        {
          displayName: args.displayName,
          ...(args.email === undefined ? {} : { email: args.email }),
          identityKey: args.identityKey,
        },
        args.now ?? Date.now(),
      ),
    ),
})

export const identityExternalIdentityUpsert = internalMutationGeneric({
  args: {
    issuer: v.string(),
    now: v.number(),
    subject: v.string(),
    userId: v.string(),
  },
  handler: (context, args) => externalIdentityUpsert(context, args),
})

export const identityOrganizationMembershipUpsert = internalMutationGeneric({
  args: {
    issuer: v.string(),
    now: v.number(),
    organizationExternalId: v.string(),
    subject: v.string(),
    userId: v.string(),
  },
  handler: (context, args) => organizationMembershipUpsert(context, args),
})

export const identityOidcIdentityUpsert = internalMutationGeneric({
  args: {
    displayName: v.optional(v.string()),
    issuer: v.string(),
    now: v.number(),
    organizationExternalId: v.string(),
    subject: v.string(),
    verifiedEmail: v.optional(v.string()),
  },
  handler: async (context, args) =>
    identityResultPublic(
      await oidcIdentityUpsert(
        context,
        {
          ...(args.displayName === undefined ? {} : { displayName: args.displayName }),
          issuer: args.issuer,
          organizationExternalId: args.organizationExternalId,
          subject: args.subject,
          ...(args.verifiedEmail === undefined ? {} : { verifiedEmail: args.verifiedEmail }),
        },
        args.now,
      ),
    ),
})

export const identityOidcLoginTransactionCreate = mutationGeneric({
  args: {
    browserBinding: v.optional(v.string()),
    codeVerifier: v.string(),
    expiresAt: v.number(),
    id: v.string(),
    issuer: v.string(),
    nonce: v.string(),
    now: v.number(),
    redirectUri: v.string(),
    returnTo: v.optional(v.string()),
    state: v.string(),
  },
  handler: async (context, args) => identityResultPublic(await oidcLoginTransactionCreate(context, args)),
})

export const identityOidcLoginTransactionConsume = mutationGeneric({
  args: {
    browserBinding: v.optional(v.string()),
    now: v.number(),
    state: v.string(),
  },
  handler: async (context, args) =>
    identityResultPublic(await oidcLoginTransactionConsume(context, args.state, args.now, args.browserBinding)),
})

export const identityOidcLoginComplete = mutationGeneric({
  args: {
    expiresAt: v.number(),
    id: v.string(),
    now: v.number(),
    presentedToken: v.optional(v.string()),
    profile: v.object({
      displayName: v.optional(v.string()),
      issuer: v.string(),
      organizationExternalId: v.string(),
      subject: v.string(),
      verifiedEmail: v.optional(v.string()),
    }),
    token: v.string(),
  },
  handler: async (context, args) => identityResultPublic(await oidcLoginComplete(context, args)),
})

// Keep the action namespace available for later provider-facing identity actions.
// The reusable action guards live in src/identity/convex and use the generated
// function references after Convex code generation is enabled.
export const identityActionBoundary = actionGeneric({
  args: { token: v.string() },
  handler: (context, args) => identityActionUserRequire(context, args.token),
})

function identityResultPublic(value: any): any {
  if (!value.success || value.data === undefined) return value
  if ("session" in value.data && "user" in value.data) {
    return {
      ...value,
      data: {
        ...value.data,
        session: identityDocumentPublic(value.data.session),
        user: identityDocumentPublic(value.data.user),
      },
    }
  }
  if ("user" in value.data) return { ...value, data: { ...value.data, user: identityDocumentPublic(value.data.user) } }
  return { ...value, data: identityDocumentPublic(value.data) }
}

function identityDocumentPublic(value: any): any {
  const document = { ...value }
  delete document._creationTime
  delete document._id
  return document
}

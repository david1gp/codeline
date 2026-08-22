import { randomBytes } from "node:crypto"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { ConvexHttpClient } from "convex/browser"
import { makeFunctionReference } from "convex/server"
import { uuidv7 } from "../../uuid/uuidv7.js"
import type { ApplicationUser } from "../db/applicationUserTable.js"
import type { identitySessionTable } from "../db/identitySessionTable.js"
import type { oidcLoginTransactionTable } from "../db/oidcLoginTransactionTable.js"
import type { OrganizationMember } from "../db/organizationMemberTable.js"
import type { IdentityClient } from "./identityClient.js"

type ConvexResult<T> = Result<T>
type ConvexUser = {
  createdAt: number
  displayName: string
  email?: string
  id: string
  updatedAt: number
}
type ConvexSession = {
  createdAt: number
  expiresAt: number
  id: string
  lastUsedAt?: number
  revokedAt?: number
  tokenHash: string
  userId: string
}
type ConvexMembership = {
  createdAt: number
  issuer: string
  organizationId: string
  subject: string
  updatedAt: number
  userId: string
}
type ConvexTransaction = {
  browserBindingHash: string
  codeVerifier: string
  consumedAt?: number
  createdAt: number
  expiresAt: number
  id: string
  issuer: string
  nonceHash: string
  redirectUri: string
  returnTo: string
  stateHash: string
}
type ConvexOidcComplete = {
  session: ConvexSession
  token: string
  user: ConvexUser
}

export function identityClientCreate(url: string): IdentityClient {
  const client = new ConvexHttpClient(url, { logger: false, skipConvexDeploymentUrlCheck: true })

  return {
    applicationUserLoad: async (sessionToken) => {
      const result = await identityQuery<{ user: ConvexUser }>(client, "identity:identityUserResolve", {
        token: sessionToken,
      })
      if (!result.success) return result
      return createResult(applicationUserMap(result.data.user))
    },
    developmentIdentityUpsert: async (identity) => {
      const result = await identityMutation<ConvexUser>(client, "identity:identityDevelopmentIdentityUpsert", identity)
      return result.success ? createResult(applicationUserMap(result.data)) : result
    },
    developmentOrganizationMemberLoad: async (identityKey, organizationExternalId, issuer) => {
      const result = await identityQuery<ConvexMembership | undefined>(
        client,
        "identity:identityDevelopmentOrganizationMemberResolve",
        { identityKey, issuer, organizationExternalId },
      )
      if (!result.success) return result
      return createResult(result.data === undefined ? undefined : organizationMemberMap(result.data))
    },
    identitySessionCreate: async (userId, options = {}) => {
      const now = options.now ?? new Date()
      const token = options.credentialCreate?.() ?? randomBytes(32).toString("base64url")
      const result = await identityMutation<ConvexSession>(client, "identity:identitySessionCreate", {
        expiresAt: now.getTime() + 12 * 60 * 60 * 1_000,
        id: options.idCreate?.() ?? uuidv7(),
        now: now.getTime(),
        token,
        userId,
      })
      if (!result.success) return result
      return createResult({ session: identitySessionMap(result.data), token })
    },
    identitySessionLoad: async (token, now = new Date()) => {
      const result = await identityQuery<ConvexSession | undefined>(client, "identity:identitySessionResolve", {
        now: now.getTime(),
        token,
      })
      if (!result.success) return result
      return createResult(result.data === undefined ? undefined : identitySessionMap(result.data))
    },
    identitySessionRevokeForToken: async (token, now = new Date()) => {
      const result = await identityMutation<ConvexSession | undefined>(client, "identity:identitySessionRevoke", {
        now: now.getTime(),
        token,
      })
      if (!result.success) return result
      return createResult(result.data === undefined ? undefined : identitySessionMap(result.data))
    },
    oidcLoginComplete: async (profile, options) => {
      const now = options.now
      const token = options.credentialCreate?.() ?? randomBytes(32).toString("base64url")
      const result = await identityMutation<ConvexOidcComplete>(client, "identity:identityOidcLoginComplete", {
        expiresAt: now.getTime() + 12 * 60 * 60 * 1_000,
        id: options.idCreate?.() ?? uuidv7(),
        now: now.getTime(),
        ...(options.presentedToken === undefined ? {} : { presentedToken: options.presentedToken }),
        profile,
        token,
      })
      if (!result.success) return result
      return createResult({
        session: identitySessionMap(result.data.session),
        token: result.data.token,
        user: applicationUserMap(result.data.user),
      })
    },
    oidcLoginTransactionConsume: async (state, now, browserBinding) => {
      const effectiveNow = now ?? new Date()
      const result = await identityMutation<ConvexTransaction | undefined>(
        client,
        "identity:identityOidcLoginTransactionConsume",
        {
          ...(browserBinding === undefined ? {} : { browserBinding }),
          now: effectiveNow.getTime(),
          state,
        },
      )
      if (!result.success) return result
      return createResult(result.data === undefined ? undefined : oidcTransactionMap(result.data))
    },
    oidcLoginTransactionCreate: async (transaction) => {
      const result = await identityMutation<ConvexTransaction>(client, "identity:identityOidcLoginTransactionCreate", {
        ...(transaction.browserBinding === undefined ? {} : { browserBinding: transaction.browserBinding }),
        codeVerifier: transaction.codeVerifier,
        expiresAt: transaction.expiresAt.getTime(),
        id: transaction.id,
        issuer: transaction.issuer,
        nonce: transaction.nonce,
        now: Date.now(),
        redirectUri: transaction.redirectUri,
        ...(transaction.returnTo === undefined ? {} : { returnTo: transaction.returnTo }),
        state: transaction.state,
      })
      return result.success ? createResult(oidcTransactionMap(result.data)) : result
    },
    organizationMemberLoad: async (sessionToken, organizationExternalId, issuer) => {
      const result = await identityQuery<ConvexMembership | undefined>(
        client,
        "identity:identityOrganizationMemberResolve",
        {
          ...(issuer === undefined ? {} : { issuer }),
          ...(organizationExternalId === undefined ? {} : { organizationExternalId }),
          token: sessionToken,
        },
      )
      if (!result.success) return result
      return createResult(result.data === undefined ? undefined : organizationMemberMap(result.data))
    },
  }
}

function identityQuery<T>(client: ConvexHttpClient, name: string, args: Record<string, unknown>) {
  return identityCall<T>(() =>
    client.query(makeFunctionReference<"query", Record<string, unknown>, ConvexResult<T>>(name), args),
  )
}

function identityMutation<T>(client: ConvexHttpClient, name: string, args: Record<string, unknown>) {
  return identityCall<T>(() =>
    client.mutation(makeFunctionReference<"mutation", Record<string, unknown>, ConvexResult<T>>(name), args),
  )
}

async function identityCall<T>(call: () => Promise<unknown>): Promise<ConvexResult<T>> {
  try {
    const value = await call()
    if (!identityResultIs(value))
      return createResultError("identityConvexCall", "The Convex identity response is invalid.")
    return value as ConvexResult<T>
  } catch (_error) {
    return createResultError("identityConvexCall", "The Convex identity service is unavailable.")
  }
}

function identityResultIs(value: unknown): value is ConvexResult<unknown> {
  return typeof value === "object" && value !== null && "success" in value && typeof value.success === "boolean"
}

function applicationUserMap(user: ConvexUser): ApplicationUser {
  return {
    createdAt: new Date(user.createdAt),
    displayName: user.displayName,
    email: user.email ?? null,
    id: user.id,
    updatedAt: new Date(user.updatedAt),
  }
}

function identitySessionMap(session: ConvexSession): typeof identitySessionTable.$inferSelect {
  return {
    createdAt: new Date(session.createdAt),
    expiresAt: new Date(session.expiresAt),
    id: session.id,
    lastUsedAt: session.lastUsedAt === undefined ? null : new Date(session.lastUsedAt),
    revokedAt: session.revokedAt === undefined ? null : new Date(session.revokedAt),
    tokenHash: session.tokenHash,
    userId: session.userId,
  }
}

function organizationMemberMap(member: ConvexMembership): OrganizationMember {
  return {
    createdAt: new Date(member.createdAt),
    issuer: member.issuer,
    organizationId: member.organizationId,
    subject: member.subject,
    updatedAt: new Date(member.updatedAt),
    userId: member.userId,
  }
}

function oidcTransactionMap(transaction: ConvexTransaction): typeof oidcLoginTransactionTable.$inferSelect {
  return {
    browserBindingHash: transaction.browserBindingHash,
    codeVerifier: transaction.codeVerifier,
    consumedAt: transaction.consumedAt === undefined ? null : new Date(transaction.consumedAt),
    createdAt: new Date(transaction.createdAt),
    expiresAt: new Date(transaction.expiresAt),
    id: transaction.id,
    issuer: transaction.issuer,
    nonceHash: transaction.nonceHash,
    redirectUri: transaction.redirectUri,
    returnTo: transaction.returnTo,
    stateHash: transaction.stateHash,
  }
}

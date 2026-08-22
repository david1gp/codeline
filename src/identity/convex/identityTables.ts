import { defineTable } from "convex/server"
import { v } from "convex/values"

export const identityTables = {
  users: defineTable({
    id: v.string(),
    displayName: v.string(),
    email: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("id", ["id"])
    .index("displayName", ["displayName"]),

  externalIdentities: defineTable({
    id: v.string(),
    userId: v.string(),
    issuer: v.string(),
    subject: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("id", ["id"])
    .index("issuerSubject", ["issuer", "subject"])
    .index("userIssuer", ["userId", "issuer"])
    .index("userId", ["userId"]),

  identitySessions: defineTable({
    id: v.string(),
    userId: v.string(),
    tokenHash: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("id", ["id"])
    .index("tokenHash", ["tokenHash"])
    .index("userIdExpiresAt", ["userId", "expiresAt"])
    .index("userId", ["userId"]),

  oidcLoginTransactions: defineTable({
    id: v.string(),
    issuer: v.string(),
    stateHash: v.string(),
    browserBindingHash: v.string(),
    nonceHash: v.string(),
    codeVerifier: v.string(),
    redirectUri: v.string(),
    returnTo: v.string(),
    expiresAt: v.number(),
    consumedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("id", ["id"])
    .index("stateHash", ["stateHash"])
    .index("expiresAt", ["expiresAt"]),

  organizations: defineTable({
    id: v.string(),
    externalId: v.string(),
    name: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("id", ["id"])
    .index("externalId", ["externalId"]),

  organizationMembers: defineTable({
    organizationId: v.string(),
    userId: v.string(),
    issuer: v.string(),
    subject: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("organizationIdUserId", ["organizationId", "userId"])
    .index("organizationIdentity", ["organizationId", "issuer", "subject"])
    .index("userId", ["userId"]),
} as const

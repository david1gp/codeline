import { internalMutationGeneric, internalQueryGeneric, mutationGeneric, queryGeneric } from "convex/server"
import { v } from "convex/values"
import { identityOrganizationOwnsRequire } from "../src/identity/convex/identityOrganizationOwnsRequire.js"
import { identityUserRequire } from "../src/identity/convex/identityUserRequire.js"
import { sessionArchive as sessionArchiveDomain } from "../src/session/convex/sessionArchive.js"
import { sessionCreate as sessionCreateDomain } from "../src/session/convex/sessionCreate.js"
import { sessionDelete as sessionDeleteDomain } from "../src/session/convex/sessionDelete.js"
import { sessionDetail as sessionDetailDomain } from "../src/session/convex/sessionDetail.js"
import { sessionList as sessionListDomain } from "../src/session/convex/sessionList.js"
import { sessionLoad as sessionLoadDomain } from "../src/session/convex/sessionLoad.js"
import { sessionPin as sessionPinDomain } from "../src/session/convex/sessionPin.js"
import { sessionSearch as sessionSearchDomain } from "../src/session/convex/sessionSearch.js"
import { sessionUpdate as sessionUpdateDomain } from "../src/session/convex/sessionUpdate.js"

const sessionListFields = {
  cursor: v.optional(v.string()),
  includeArchived: v.boolean(),
  limit: v.number(),
  organizationId: v.string(),
  search: v.optional(v.string()),
}

const sessionSearchFields = {
  cursor: v.optional(v.string()),
  includeArchived: v.boolean(),
  limit: v.number(),
  organizationId: v.string(),
  search: v.string(),
}

const sessionCreateFields = {
  clientRequestId: v.string(),
  metadata: v.optional(v.record(v.string(), v.string())),
  primaryAgentId: v.string(),
  projectPath: v.optional(v.string()),
  serverId: v.string(),
  title: v.string(),
}

const sessionListResult = queryGeneric({
  args: { ...sessionListFields, token: v.string() },
  handler: async (context, args) => {
    const identity = await identityUserRequire(context, args.token)
    if (!identity.success) return identity
    const authorized = await identityOrganizationOwnsRequire(context, args.token, args.organizationId)
    if (!authorized.success) return authorized
    return sessionListDomain(context, identity.data.userId, args.organizationId, {
      ...(args.cursor === undefined ? {} : { cursor: args.cursor }),
      includeArchived: args.includeArchived,
      limit: args.limit,
      ...(args.search === undefined ? {} : { search: args.search }),
    })
  },
})

const sessionSearchResult = queryGeneric({
  args: { ...sessionSearchFields, token: v.string() },
  handler: async (context, args) => {
    const identity = await identityUserRequire(context, args.token)
    if (!identity.success) return identity
    const authorized = await identityOrganizationOwnsRequire(context, args.token, args.organizationId)
    if (!authorized.success) return authorized
    return sessionSearchDomain(context, identity.data.userId, args.organizationId, args.search, {
      ...(args.cursor === undefined ? {} : { cursor: args.cursor }),
      includeArchived: args.includeArchived,
      limit: args.limit,
    })
  },
})

const sessionLoadResult = queryGeneric({
  args: { organizationId: v.string(), sessionId: v.string(), token: v.string() },
  handler: async (context, args) => {
    const identity = await identityUserRequire(context, args.token)
    if (!identity.success) return identity
    const authorized = await identityOrganizationOwnsRequire(context, args.token, args.organizationId)
    if (!authorized.success) return authorized
    return sessionLoadDomain(context, identity.data.userId, args.sessionId, args.organizationId)
  },
})

const sessionDetailResult = queryGeneric({
  args: { organizationId: v.string(), sessionId: v.string(), token: v.string() },
  handler: async (context, args) => {
    const identity = await identityUserRequire(context, args.token)
    if (!identity.success) return identity
    const authorized = await identityOrganizationOwnsRequire(context, args.token, args.organizationId)
    if (!authorized.success) return authorized
    return sessionDetailDomain(context, identity.data.userId, args.sessionId, args.organizationId)
  },
})

const sessionCreateResult = mutationGeneric({
  args: { ...sessionCreateFields, organizationId: v.string(), token: v.string() },
  handler: async (context, args) => {
    const identity = await identityUserRequire(context, args.token)
    if (!identity.success) return identity
    const authorized = await identityOrganizationOwnsRequire(context, args.token, args.organizationId)
    if (!authorized.success) return authorized
    return sessionCreateDomain(context, identity.data.userId, args.organizationId, {
      clientRequestId: args.clientRequestId,
      metadata: args.metadata ?? {},
      primaryAgentId: args.primaryAgentId,
      ...(args.projectPath === undefined ? {} : { projectPath: args.projectPath }),
      serverId: args.serverId,
      title: args.title,
    })
  },
})

const sessionUpdateResult = mutationGeneric({
  args: { organizationId: v.string(), sessionId: v.string(), title: v.string(), token: v.string() },
  handler: async (context, args) => {
    const identity = await identityUserRequire(context, args.token)
    if (!identity.success) return identity
    const authorized = await identityOrganizationOwnsRequire(context, args.token, args.organizationId)
    if (!authorized.success) return authorized
    return sessionUpdateDomain(
      context,
      identity.data.userId,
      args.sessionId,
      { title: args.title },
      args.organizationId,
    )
  },
})

const sessionArchiveResult = mutationGeneric({
  args: { organizationId: v.string(), sessionId: v.string(), token: v.string() },
  handler: async (context, args) => {
    const identity = await identityUserRequire(context, args.token)
    if (!identity.success) return identity
    const authorized = await identityOrganizationOwnsRequire(context, args.token, args.organizationId)
    if (!authorized.success) return authorized
    return sessionArchiveDomain(context, identity.data.userId, args.sessionId, args.organizationId)
  },
})

const sessionPinResult = mutationGeneric({
  args: { organizationId: v.string(), pinned: v.boolean(), sessionId: v.string(), token: v.string() },
  handler: async (context, args) => {
    const identity = await identityUserRequire(context, args.token)
    if (!identity.success) return identity
    const authorized = await identityOrganizationOwnsRequire(context, args.token, args.organizationId)
    if (!authorized.success) return authorized
    return sessionPinDomain(context, identity.data.userId, args.sessionId, args.pinned, args.organizationId)
  },
})

const sessionDeleteResult = mutationGeneric({
  args: { organizationId: v.string(), sessionId: v.string(), token: v.string() },
  handler: async (context, args) => {
    const identity = await identityUserRequire(context, args.token)
    if (!identity.success) return identity
    const authorized = await identityOrganizationOwnsRequire(context, args.token, args.organizationId)
    if (!authorized.success) return authorized
    return sessionDeleteDomain(context, identity.data.userId, args.sessionId, args.organizationId)
  },
})

export const sessionList = sessionListResult
export const sessionSearch = sessionSearchResult
export const sessionLoad = sessionLoadResult
export const sessionDetail = sessionDetailResult
export const sessionCreate = sessionCreateResult
export const sessionUpdate = sessionUpdateResult
export const sessionArchive = sessionArchiveResult
export const sessionPin = sessionPinResult
export const sessionDelete = sessionDeleteResult

export const sessionListInternal = internalQueryGeneric({
  args: { ...sessionListFields, userId: v.string() },
  handler: (context, args) =>
    sessionListDomain(context, args.userId, args.organizationId, {
      ...(args.cursor === undefined ? {} : { cursor: args.cursor }),
      includeArchived: args.includeArchived,
      limit: args.limit,
      ...(args.search === undefined ? {} : { search: args.search }),
    }),
})

export const sessionSearchInternal = internalQueryGeneric({
  args: { ...sessionSearchFields, userId: v.string() },
  handler: (context, args) =>
    sessionSearchDomain(context, args.userId, args.organizationId, args.search, {
      ...(args.cursor === undefined ? {} : { cursor: args.cursor }),
      includeArchived: args.includeArchived,
      limit: args.limit,
    }),
})

export const sessionLoadInternal = internalQueryGeneric({
  args: { organizationId: v.string(), sessionId: v.string(), userId: v.string() },
  handler: (context, args) => sessionLoadDomain(context, args.userId, args.sessionId, args.organizationId),
})

export const sessionDetailInternal = internalQueryGeneric({
  args: { organizationId: v.string(), sessionId: v.string(), userId: v.string() },
  handler: (context, args) => sessionDetailDomain(context, args.userId, args.sessionId, args.organizationId),
})

export const sessionCreateInternal = internalMutationGeneric({
  args: { ...sessionCreateFields, organizationId: v.string(), userId: v.string() },
  handler: (context, args) =>
    sessionCreateDomain(context, args.userId, args.organizationId, {
      clientRequestId: args.clientRequestId,
      metadata: args.metadata ?? {},
      primaryAgentId: args.primaryAgentId,
      ...(args.projectPath === undefined ? {} : { projectPath: args.projectPath }),
      serverId: args.serverId,
      title: args.title,
    }),
})

export const sessionUpdateInternal = internalMutationGeneric({
  args: { organizationId: v.string(), sessionId: v.string(), title: v.string(), userId: v.string() },
  handler: (context, args) =>
    sessionUpdateDomain(context, args.userId, args.sessionId, { title: args.title }, args.organizationId),
})

export const sessionArchiveInternal = internalMutationGeneric({
  args: { organizationId: v.string(), sessionId: v.string(), userId: v.string() },
  handler: (context, args) => sessionArchiveDomain(context, args.userId, args.sessionId, args.organizationId),
})

export const sessionPinInternal = internalMutationGeneric({
  args: { organizationId: v.string(), pinned: v.boolean(), sessionId: v.string(), userId: v.string() },
  handler: (context, args) => sessionPinDomain(context, args.userId, args.sessionId, args.pinned, args.organizationId),
})

export const sessionDeleteInternal = internalMutationGeneric({
  args: { organizationId: v.string(), sessionId: v.string(), userId: v.string() },
  handler: (context, args) => sessionDeleteDomain(context, args.userId, args.sessionId, args.organizationId),
})

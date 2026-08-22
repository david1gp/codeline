import { internalMutationGeneric, internalQueryGeneric, queryGeneric } from "convex/server"
import { v } from "convex/values"
import { identityOrganizationOwnsRequire } from "../src/identity/convex/identityOrganizationOwnsRequire.js"
import { serverList as serverListDomain } from "../src/servers/convex/serverList.js"
import { serverLoad as serverLoadDomain } from "../src/servers/convex/serverLoad.js"
import { serverReconcile as serverReconcileDomain } from "../src/servers/convex/serverReconcile.js"

const serverReconcileInputValidator = v.object({
  createdAt: v.number(),
  endpoint: v.string(),
  id: v.string(),
  metadata: v.any(),
  name: v.string(),
  organizationId: v.string(),
  updatedAt: v.number(),
})

export const serverList = queryGeneric({
  args: {
    organizationId: v.string(),
    search: v.optional(v.string()),
    token: v.string(),
  },
  handler: async (context, args) => {
    const authorized = await identityOrganizationOwnsRequire(context, args.token, args.organizationId)
    if (!authorized.success) return authorized
    return serverListDomain(context, args.organizationId, args.search)
  },
})

export const serverLoad = queryGeneric({
  args: {
    organizationId: v.string(),
    serverId: v.string(),
    token: v.string(),
  },
  handler: async (context, args) => {
    const authorized = await identityOrganizationOwnsRequire(context, args.token, args.organizationId)
    if (!authorized.success) return authorized
    return serverLoadDomain(context, args.organizationId, args.serverId)
  },
})

export const serverListInternal = internalQueryGeneric({
  args: {
    organizationId: v.string(),
    search: v.optional(v.string()),
  },
  handler: (context, args) => serverListDomain(context, args.organizationId, args.search),
})

export const serverLoadInternal = internalQueryGeneric({
  args: {
    organizationId: v.string(),
    serverId: v.string(),
  },
  handler: (context, args) => serverLoadDomain(context, args.organizationId, args.serverId),
})

export const serverReconcile = internalMutationGeneric({
  args: serverReconcileInputValidator.fields,
  handler: (context, args) => serverReconcileDomain(context, args),
})

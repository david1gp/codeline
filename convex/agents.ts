import { internalMutationGeneric, internalQueryGeneric, mutationGeneric, queryGeneric } from "convex/server"
import { v } from "convex/values"
import { agentCatalogReconcile as agentCatalogReconcileDomain } from "../src/agents/convex/agentCatalogReconcile.js"
import { agentConfigurationValidator } from "../src/agents/convex/agentConfigurationValidator.js"
import { agentCreate as agentCreateDomain } from "../src/agents/convex/agentCreate.js"
import { agentList as agentListDomain } from "../src/agents/convex/agentList.js"
import { agentLoad as agentLoadDomain } from "../src/agents/convex/agentLoad.js"
import { agentUpdate as agentUpdateDomain } from "../src/agents/convex/agentUpdate.js"
import type { AgentConfiguration } from "../src/agents/schema/agentConfigurationSchema.js"
import { identityOrganizationOwnsRequire } from "../src/identity/convex/identityOrganizationOwnsRequire.js"

const agentCatalogReconcileInputValidator = v.object({
  configuration: agentConfigurationValidator,
  createdAt: v.number(),
  id: v.string(),
  name: v.string(),
  parentAgentId: v.optional(v.string()),
  role: v.string(),
  serverId: v.string(),
  sortOrder: v.number(),
  updatedAt: v.number(),
})

export const agentList = queryGeneric({
  args: {
    organizationId: v.string(),
    search: v.optional(v.string()),
    serverId: v.string(),
    token: v.string(),
  },
  handler: async (context, args) => {
    const authorized = await identityOrganizationOwnsRequire(context, args.token, args.organizationId)
    if (!authorized.success) return authorized
    return agentListDomain(context, args.organizationId, args.serverId, args.search)
  },
})

export const agentLoad = queryGeneric({
  args: {
    agentId: v.string(),
    organizationId: v.string(),
    serverId: v.string(),
    token: v.string(),
  },
  handler: async (context, args) => {
    const authorized = await identityOrganizationOwnsRequire(context, args.token, args.organizationId)
    if (!authorized.success) return authorized
    return agentLoadDomain(context, args.organizationId, args.serverId, args.agentId)
  },
})

export const agentCreate = mutationGeneric({
  args: {
    configuration: agentConfigurationValidator,
    name: v.string(),
    organizationId: v.string(),
    role: v.string(),
    serverId: v.string(),
    token: v.string(),
  },
  handler: async (context, args) => {
    const authorized = await identityOrganizationOwnsRequire(context, args.token, args.organizationId)
    if (!authorized.success) return authorized
    return agentCreateDomain(context, args.organizationId, args.serverId, {
      configuration: args.configuration,
      name: args.name,
      role: args.role,
    })
  },
})

export const agentUpdate = mutationGeneric({
  args: {
    agentId: v.string(),
    configuration: v.optional(agentConfigurationValidator),
    name: v.optional(v.string()),
    organizationId: v.string(),
    role: v.optional(v.string()),
    serverId: v.string(),
    token: v.string(),
  },
  handler: async (context, args) => {
    const authorized = await identityOrganizationOwnsRequire(context, args.token, args.organizationId)
    if (!authorized.success) return authorized
    return agentUpdateDomain(context, args.organizationId, args.serverId, args.agentId, {
      ...(args.configuration === undefined ? {} : { configuration: args.configuration }),
      ...(args.name === undefined ? {} : { name: args.name }),
      ...(args.role === undefined ? {} : { role: args.role }),
    })
  },
})

export const agentListInternal = internalQueryGeneric({
  args: {
    organizationId: v.string(),
    search: v.optional(v.string()),
    serverId: v.string(),
  },
  handler: (context, args) => agentListDomain(context, args.organizationId, args.serverId, args.search),
})

export const agentLoadInternal = internalQueryGeneric({
  args: {
    agentId: v.string(),
    organizationId: v.string(),
    serverId: v.string(),
  },
  handler: (context, args) => agentLoadDomain(context, args.organizationId, args.serverId, args.agentId),
})

export const agentCreateInternal = internalMutationGeneric({
  args: {
    configuration: agentConfigurationValidator,
    name: v.string(),
    organizationId: v.string(),
    role: v.string(),
    serverId: v.string(),
  },
  handler: (context, args) =>
    agentCreateDomain(context, args.organizationId, args.serverId, {
      configuration: args.configuration,
      name: args.name,
      role: args.role,
    }),
})

export const agentUpdateInternal = internalMutationGeneric({
  args: {
    agentId: v.string(),
    configuration: v.optional(agentConfigurationValidator),
    name: v.optional(v.string()),
    organizationId: v.string(),
    role: v.optional(v.string()),
    serverId: v.string(),
  },
  handler: (context, args) =>
    agentUpdateDomain(context, args.organizationId, args.serverId, args.agentId, {
      ...(args.configuration === undefined ? {} : { configuration: args.configuration }),
      ...(args.name === undefined ? {} : { name: args.name }),
      ...(args.role === undefined ? {} : { role: args.role }),
    }),
})

export const agentCatalogReconcile = internalMutationGeneric({
  args: {
    agents: v.array(agentCatalogReconcileInputValidator),
    organizationId: v.string(),
  },
  handler: (context, args) =>
    agentCatalogReconcileDomain(
      context,
      args.organizationId,
      args.agents.map((agent) => ({ ...agent, configuration: agent.configuration as AgentConfiguration })),
    ),
})

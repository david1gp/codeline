import { defineTable } from "convex/server"
import { v } from "convex/values"
import { agentConfigurationValidator } from "./agentConfigurationValidator.js"

export const agentTables = {
  agents: defineTable({
    id: v.string(),
    serverId: v.string(),
    parentAgentId: v.optional(v.string()),
    name: v.string(),
    role: v.string(),
    configuration: agentConfigurationValidator,
    sortOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("id", ["id"])
    .index("serverId", ["serverId"])
    .index("serverIdName", ["serverId", "name"])
    .index("serverIdId", ["serverId", "id"])
    .index("serverIdSortOrderNameId", ["serverId", "sortOrder", "name", "id"])
    .index("parentAgentId", ["parentAgentId"]),
} as const

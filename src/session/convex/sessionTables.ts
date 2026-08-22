import { defineTable } from "convex/server"
import { v } from "convex/values"
import { convexJsonValueValidator } from "../../convex/convexJsonValueValidator.js"

export const sessionTables = {
  sessions: defineTable({
    id: v.string(),
    userId: v.string(),
    serverId: v.string(),
    primaryAgentId: v.string(),
    projectPath: v.string(),
    parentSessionId: v.optional(v.string()),
    title: v.string(),
    clientRequestId: v.string(),
    metadata: convexJsonValueValidator,
    pinned: v.boolean(),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("id", ["id"])
    .index("userIdId", ["userId", "id"])
    .index("userIdClientRequestId", ["userId", "clientRequestId"])
    .index("userIdUpdatedAtId", ["userId", "updatedAt", "id"])
    .index("userIdArchivedAt", ["userId", "archivedAt"])
    .index("serverId", ["serverId"])
    .index("serverIdPrimaryAgentId", ["serverId", "primaryAgentId"])
    .index("primaryAgentId", ["primaryAgentId"])
    .index("parentSessionId", ["parentSessionId"]),
} as const

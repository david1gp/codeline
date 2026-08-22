import { defineTable } from "convex/server"
import { v } from "convex/values"
import { convexJsonValueValidator } from "../../convex/convexJsonValueValidator.js"

export const messageTables = {
  messages: defineTable({
    id: v.string(),
    sessionId: v.string(),
    agentId: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant")),
    sequence: v.number(),
    content: v.string(),
    clientRequestId: v.string(),
    metadata: convexJsonValueValidator,
    finalizedAt: v.number(),
    createdAt: v.number(),
  })
    .index("id", ["id"])
    .index("sessionIdSequence", ["sessionId", "sequence"])
    .index("sessionIdSequenceId", ["sessionId", "sequence", "id"])
    .index("sessionIdClientRequestId", ["sessionId", "clientRequestId"])
    .index("agentId", ["agentId"])
    .index("role", ["role"]),
} as const

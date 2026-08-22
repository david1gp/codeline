import { defineTable } from "convex/server"
import { v } from "convex/values"

export const noteTables = {
  notes: defineTable({
    id: v.string(),
    userId: v.string(),
    content: v.string(),
    projectPath: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("id", ["id"])
    .index("userIdId", ["userId", "id"])
    .index("userId", ["userId"])
    .index("userIdUpdatedAtId", ["userId", "updatedAt", "id"])
    .index("userIdProjectPath", ["userId", "projectPath"])
    .index("userIdSortOrderUpdatedAtId", ["userId", "sortOrder", "updatedAt", "id"]),
} as const

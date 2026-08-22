import { defineTable } from "convex/server"
import { v } from "convex/values"
import { convexJsonValueValidator } from "../../convex/convexJsonValueValidator.js"

export const serverTables = {
  servers: defineTable({
    id: v.string(),
    organizationId: v.string(),
    name: v.string(),
    endpoint: v.string(),
    metadata: convexJsonValueValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("id", ["id"])
    .index("organizationId", ["organizationId"])
    .index("organizationIdName", ["organizationId", "name"])
    .index("organizationIdNameId", ["organizationId", "name", "id"])
    .index("name", ["name"]),
} as const

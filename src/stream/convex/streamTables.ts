import { defineTable } from "convex/server"
import { v } from "convex/values"
import { convexJsonValueValidator } from "../../convex/convexJsonValueValidator.js"

export const streamTables = {
  streamEvents: defineTable({
    id: v.string(),
    sessionId: v.string(),
    streamId: v.string(),
    sequence: v.number(),
    eventType: v.string(),
    payload: convexJsonValueValidator,
    idempotencyKey: v.string(),
    createdAt: v.number(),
  })
    .index("id", ["id"])
    .index("streamIdSequence", ["streamId", "sequence"])
    .index("streamIdIdempotencyKey", ["streamId", "idempotencyKey"])
    .index("sessionIdStreamIdSequence", ["sessionId", "streamId", "sequence"])
    .index("createdAt", ["createdAt"]),

  streamCheckpoints: defineTable({
    id: v.string(),
    sessionId: v.string(),
    streamId: v.string(),
    lastSequence: v.number(),
    updatedAt: v.number(),
  })
    .index("id", ["id"])
    .index("sessionIdStreamId", ["sessionId", "streamId"])
    .index("sessionId", ["sessionId"]),
} as const

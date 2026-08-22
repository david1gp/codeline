import { v } from "convex/values"

// Convex's `any` accepts values that are valid Convex values, while these
// fields are persisted as JSONB today. Keep the top-level JSON contract
// explicit; nested values remain open because the legacy JSONB fields are
// intentionally untyped.
export const convexJsonValueValidator = v.union(
  v.null(),
  v.boolean(),
  v.number(),
  v.string(),
  v.array(v.any()),
  v.record(v.string(), v.any()),
)

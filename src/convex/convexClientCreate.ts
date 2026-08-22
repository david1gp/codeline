import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { ConvexClient } from "convex/browser"

export function convexClientCreate(url: string): Result<ConvexClient> {
  const op = "convexClientCreate"

  try {
    return createResult(new ConvexClient(url, { disabled: typeof window === "undefined" }))
  } catch (_error: unknown) {
    return createResultError(op, "The Convex client could not be created.")
  }
}

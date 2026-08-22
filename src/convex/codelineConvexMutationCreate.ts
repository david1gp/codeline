import type { Result } from "@adaptive-ds/result"
import type { FunctionReference } from "convex/server"
import { useContext } from "solid-js"
import { convexContext } from "./convexContext.js"

export function codelineConvexMutationCreate<T>(mutation: FunctionReference<"mutation">) {
  const context = useContext(convexContext)
  return async (args: Record<string, unknown>): Promise<Result<T>> => {
    if (context === undefined)
      return { success: false, op: "codelineConvexMutationCreate", errorMessage: "The Convex client is unavailable." }
    try {
      const result: unknown = await context.client.mutation(mutation, { ...args, token: context.token })
      if (!convexResultIs<T>(result))
        return { success: false, op: "codelineConvexMutationCreate", errorMessage: "The Convex response is invalid." }
      return result
    } catch (_error) {
      return { success: false, op: "codelineConvexMutationCreate", errorMessage: "The Convex service is unavailable." }
    }
  }
}

function convexResultIs<T>(value: unknown): value is Result<T> {
  return typeof value === "object" && value !== null && "success" in value && typeof value.success === "boolean"
}

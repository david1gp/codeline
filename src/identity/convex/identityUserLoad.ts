import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericQueryCtx } from "convex/server"

type IdentityUser = {
  _creationTime: number
  _id: string
  createdAt: number
  displayName: string
  email?: string
  id: string
  updatedAt: number
}

export async function identityUserLoad(
  context: Pick<GenericQueryCtx<any>, "db">,
  userId: string,
): Promise<Result<IdentityUser | undefined>> {
  const op = "identityUserLoad"

  try {
    const user = await context.db
      .query("users")
      .withIndex("id", (query: any) => query.eq("id", userId))
      .first()
    return createResult(user === null ? undefined : (user as IdentityUser))
  } catch (_error) {
    return createResultError(op, "The application user could not be loaded.")
  }
}

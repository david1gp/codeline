import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericMutationCtx } from "convex/server"

type IdentityUser = {
  _creationTime: number
  _id: string
  createdAt: number
  displayName: string
  email?: string
  id: string
  updatedAt: number
}

type IdentityUserInput = {
  displayName: string
  email?: string
  id: string
  now: number
}

export async function identityUserUpsert(
  context: Pick<GenericMutationCtx<any>, "db">,
  input: IdentityUserInput,
): Promise<Result<IdentityUser>> {
  const op = "identityUserUpsert"

  try {
    const existingUser = await context.db
      .query("users")
      .withIndex("id", (query: any) => query.eq("id", input.id))
      .first()
    if (existingUser !== null) {
      await context.db.patch("users", existingUser._id, {
        displayName: input.displayName,
        ...(input.email === undefined ? {} : { email: input.email }),
        updatedAt: input.now,
      })
      return createResult({
        ...(existingUser as IdentityUser),
        displayName: input.displayName,
        ...(input.email === undefined ? {} : { email: input.email }),
        updatedAt: input.now,
      })
    }

    const documentId = await context.db.insert("users", {
      id: input.id,
      displayName: input.displayName,
      ...(input.email === undefined ? {} : { email: input.email }),
      createdAt: input.now,
      updatedAt: input.now,
    })
    return createResult({
      _creationTime: input.now,
      _id: documentId,
      createdAt: input.now,
      displayName: input.displayName,
      ...(input.email === undefined ? {} : { email: input.email }),
      id: input.id,
      updatedAt: input.now,
    })
  } catch (_error) {
    return createResultError(op, "The application user could not be stored.")
  }
}

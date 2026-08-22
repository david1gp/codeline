import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericQueryCtx } from "convex/server"
import { identitySessionResolve } from "./identitySessionResolve.js"
import { identityUserLoad } from "./identityUserLoad.js"

type IdentityUser = {
  createdAt: number
  displayName: string
  email?: string
  id: string
  updatedAt: number
}

type ResolvedIdentity = {
  sessionId: string
  user: IdentityUser
  userId: string
}

export async function identityUserRequire(
  context: Pick<GenericQueryCtx<any>, "db">,
  token: string,
): Promise<Result<ResolvedIdentity>> {
  const op = "identityUserRequire"
  const session = await identitySessionResolve(context, token)
  if (!session.success) return createResultError(op, session.errorMessage)
  if (session.data === undefined) return createResultError(op, "Authentication is required.")

  const user = await identityUserLoad(context, session.data.userId)
  if (!user.success) return createResultError(op, user.errorMessage)
  if (user.data === undefined) return createResultError(op, "Authentication is required.")

  return createResult({
    sessionId: session.data.id,
    user: {
      createdAt: user.data.createdAt,
      displayName: user.data.displayName,
      ...(user.data.email === undefined ? {} : { email: user.data.email }),
      id: user.data.id,
      updatedAt: user.data.updatedAt,
    },
    userId: user.data.id,
  })
}

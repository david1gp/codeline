import type { GenericActionCtx } from "convex/server"
import { identityActionUserOwnsRequire } from "./identityActionUserOwnsRequire.js"
import { identitySessionTokenRead } from "./identitySessionTokenRead.js"

export function identityHttpUserOwnsRequire(
  context: Pick<GenericActionCtx<any>, "runQuery">,
  request: Request,
  userId: string,
) {
  const token = identitySessionTokenRead(request)
  if (token === undefined) return identityUserMissing()
  return identityActionUserOwnsRequire(context, token, userId)
}

async function identityUserMissing() {
  return {
    success: false as const,
    op: "identityHttpUserOwnsRequire",
    errorMessage: "Authentication is required.",
  }
}

import type { GenericActionCtx } from "convex/server"
import { identityActionUserRequire } from "./identityActionUserRequire.js"
import { identitySessionTokenRead } from "./identitySessionTokenRead.js"

export function identityHttpUserRequire(context: Pick<GenericActionCtx<any>, "runQuery">, request: Request) {
  const token = identitySessionTokenRead(request)
  if (token === undefined) return identityActionUserRequireMissing()
  return identityActionUserRequire(context, token)
}

async function identityActionUserRequireMissing() {
  return {
    success: false as const,
    op: "identityHttpUserRequire",
    errorMessage: "Authentication is required.",
  }
}

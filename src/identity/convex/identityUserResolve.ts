import type { GenericQueryCtx } from "convex/server"
import { identityUserRequire } from "./identityUserRequire.js"

export function identityUserResolve(context: Pick<GenericQueryCtx<any>, "db">, token: string) {
  return identityUserRequire(context, token)
}

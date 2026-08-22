import type { GenericQueryCtx } from "convex/server"
import { sessionLoad } from "./sessionLoad.js"

type SessionQueryContext = Pick<GenericQueryCtx<any>, "db">

export function sessionDetail(context: SessionQueryContext, userId: string, sessionId: string, organizationId: string) {
  return sessionLoad(context, userId, sessionId, organizationId)
}

import type { GenericQueryCtx } from "convex/server"
import { sessionList } from "./sessionList.js"

type SessionQueryContext = Pick<GenericQueryCtx<any>, "db">

export function sessionSearch(
  context: SessionQueryContext,
  userId: string,
  organizationId: string,
  search: string,
  options: { cursor?: string; includeArchived: boolean; limit: number },
) {
  return sessionList(context, userId, organizationId, { ...options, search })
}

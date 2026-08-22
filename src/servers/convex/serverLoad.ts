import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericQueryCtx } from "convex/server"
import { serverDocumentPublic } from "./serverDocumentPublic.js"
import type { ServerRecord } from "./serverRecord.js"

type ServerQueryContext = Pick<GenericQueryCtx<any>, "db">

export async function serverLoad(
  context: ServerQueryContext,
  organizationId: string,
  serverId: string,
): Promise<Result<ServerRecord>> {
  const op = "serverLoad"

  try {
    const document = await context.db
      .query("servers")
      .withIndex("id", (query: any) => query.eq("id", serverId))
      .first()
    if (document === null || document.organizationId !== organizationId)
      return createResultError(op, "The server could not be found.")
    return createResult(serverDocumentPublic(document))
  } catch (_error) {
    return createResultError(op, "The server could not be loaded.")
  }
}

import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericQueryCtx } from "convex/server"
import { agentDocumentPublic } from "../../agents/convex/agentDocumentPublic.js"
import type { AgentRecord } from "../../agents/convex/agentRecord.js"
import { serverDocumentPublic } from "../../servers/convex/serverDocumentPublic.js"
import type { ServerRecord } from "../../servers/convex/serverRecord.js"
import { sessionDocumentPublic } from "./sessionDocumentPublic.js"
import type { SessionRecord } from "./sessionRecord.js"

type SessionQueryContext = Pick<GenericQueryCtx<any>, "db">

export async function sessionOwnedDocumentLoad(
  context: SessionQueryContext,
  userId: string,
  sessionId: string,
  organizationId: string,
): Promise<
  Result<{
    agent: AgentRecord
    document: SessionRecord & { _id: any }
    server: ServerRecord
  }>
> {
  const op = "sessionOwnedDocumentLoad"

  try {
    const document = await context.db
      .query("sessions")
      .withIndex("userIdId", (query: any) => query.eq("userId", userId).eq("id", sessionId))
      .first()
    if (document === null) return createResultError(op, "The session could not be found.")

    const server = await context.db
      .query("servers")
      .withIndex("id", (query: any) => query.eq("id", document.serverId))
      .first()
    if (server === null || server.organizationId !== organizationId)
      return createResultError(op, "The session could not be found.")

    const agent = await context.db
      .query("agents")
      .withIndex("serverIdId", (query: any) =>
        query.eq("serverId", document.serverId).eq("id", document.primaryAgentId),
      )
      .first()
    if (agent === null) return createResultError(op, "The session could not be found.")

    return createResult({
      agent: agentDocumentPublic(agent),
      document: { ...sessionDocumentPublic(document), _id: document._id },
      server: serverDocumentPublic(server),
    })
  } catch (_error) {
    return createResultError(op, "The session could not be loaded.")
  }
}

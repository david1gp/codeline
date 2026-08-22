import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import { agentTable } from "../../agents/db/agentTable.js"
import { applicationUserTable } from "../../identity/db/applicationUserTable.js"
import type { JournalEventRecipientResolver } from "../../journal/actions/journalEventRecipientResolver.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { sessionTable } from "./sessionTable.js"

type SessionJournalRecipientResolverCreateOptions = {
  organizationId: string
  pendingSessionAuthorization?: {
    primaryAgentId?: string
    serverId?: string
    sourceSessionId?: string
    userId: string
  }
}

export function sessionJournalRecipientResolverCreate(
  options: SessionJournalRecipientResolverCreateOptions,
): JournalEventRecipientResolver {
  return async (transaction, resource): Promise<Result<readonly string[]>> => {
    const op = "sessionJournalRecipientResolver"
    if (resource.resourceType !== "session") return createResultError(op, "The session journal resource is invalid.")

    const [session] = await transaction
      .select({ userId: sessionTable.userId })
      .from(sessionTable)
      .innerJoin(
        serverTable,
        and(eq(sessionTable.serverId, serverTable.id), eq(serverTable.organizationId, options.organizationId)),
      )
      .where(eq(sessionTable.id, resource.resourceId))
      .limit(1)
    if (session !== undefined) return createResult([session.userId])

    const pending = options.pendingSessionAuthorization
    if (pending === undefined) return createResultError(op, "The session journal resource could not be authorized.")

    if (pending.sourceSessionId !== undefined) {
      const [source] = await transaction
        .select({ userId: sessionTable.userId })
        .from(sessionTable)
        .innerJoin(
          serverTable,
          and(eq(sessionTable.serverId, serverTable.id), eq(serverTable.organizationId, options.organizationId)),
        )
        .where(and(eq(sessionTable.id, pending.sourceSessionId), eq(sessionTable.userId, pending.userId)))
        .limit(1)
      if (source === undefined) return createResultError(op, "The session journal resource could not be authorized.")
      return createResult([source.userId])
    }

    if (pending.serverId === undefined)
      return createResultError(op, "The session journal resource could not be authorized.")
    const [server] = await transaction
      .select({ id: serverTable.id })
      .from(serverTable)
      .where(and(eq(serverTable.id, pending.serverId), eq(serverTable.organizationId, options.organizationId)))
      .limit(1)
    if (server === undefined) return createResultError(op, "The session journal resource could not be authorized.")
    if (pending.primaryAgentId !== undefined) {
      const [agent] = await transaction
        .select({ id: agentTable.id })
        .from(agentTable)
        .innerJoin(serverTable, eq(agentTable.serverId, serverTable.id))
        .where(
          and(
            eq(serverTable.id, pending.serverId),
            eq(agentTable.id, pending.primaryAgentId),
            eq(serverTable.organizationId, options.organizationId),
          ),
        )
        .limit(1)
      if (agent === undefined) return createResultError(op, "The session journal resource could not be authorized.")
    }
    const [user] = await transaction
      .select({ id: applicationUserTable.id })
      .from(applicationUserTable)
      .where(eq(applicationUserTable.id, pending.userId))
      .limit(1)
    if (user === undefined) return createResultError(op, "The session journal recipient could not be found.")
    return createResult([user.id])
  }
}

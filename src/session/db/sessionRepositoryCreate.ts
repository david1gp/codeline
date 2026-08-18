import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import { agentTable } from "../../agents/db/agentTable.js"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { sessionTable } from "./sessionTable.js"

export async function sessionRepositoryCreate(
  database: DatabaseExecutor,
  userId: string,
  organizationId: string,
  input: {
    clientRequestId: string
    primaryAgentId: string
    projectPath?: string
    serverId: string
    title: string
    metadata: Record<string, string>
    pinned?: boolean
  },
): Promise<Result<{ created: boolean; session: typeof sessionTable.$inferSelect }>> {
  const op = "sessionRepositoryCreate"

  try {
    const [existing] = await database
      .select({ session: sessionTable })
      .from(sessionTable)
      .innerJoin(
        serverTable,
        and(eq(sessionTable.serverId, serverTable.id), eq(serverTable.organizationId, organizationId)),
      )
      .where(and(eq(sessionTable.userId, userId), eq(sessionTable.clientRequestId, input.clientRequestId)))
      .limit(1)
    if (existing !== undefined) return createResult({ created: false, session: existing.session })

    const [server] = await database
      .select({ id: serverTable.id })
      .from(serverTable)
      .where(and(eq(serverTable.id, input.serverId), eq(serverTable.organizationId, organizationId)))
      .limit(1)
    if (server === undefined) return createResultError(op, "The server could not be found.")

    const [agent] = await database
      .select({ id: agentTable.id })
      .from(agentTable)
      .where(and(eq(agentTable.id, input.primaryAgentId), eq(agentTable.serverId, input.serverId)))
      .limit(1)
    if (agent === undefined) return createResultError(op, "The agent could not be found.")

    const [created] = await database
      .insert(sessionTable)
      .values({
        id: uuidv7(),
        clientRequestId: input.clientRequestId,
        metadata: input.metadata,
        primaryAgentId: input.primaryAgentId,
        projectPath: input.projectPath ?? "~",
        serverId: input.serverId,
        title: input.title,
        userId,
        pinned: input.pinned ?? true,
      })
      .onConflictDoNothing({ target: [sessionTable.userId, sessionTable.clientRequestId] })
      .returning()

    if (created !== undefined) return createResult({ created: true, session: created })

    const [idempotent] = await database
      .select({ session: sessionTable })
      .from(sessionTable)
      .innerJoin(
        serverTable,
        and(eq(sessionTable.serverId, serverTable.id), eq(serverTable.organizationId, organizationId)),
      )
      .where(and(eq(sessionTable.userId, userId), eq(sessionTable.clientRequestId, input.clientRequestId)))
      .limit(1)
    if (idempotent !== undefined) return createResult({ created: false, session: idempotent.session })
    return createResultError(op, "The server could not be found.")
  } catch (_error) {
    return createResultError(op, "The session could not be created.")
  }
}

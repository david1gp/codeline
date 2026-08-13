import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { messageCopyFinalizedPrefix } from "../../message/actions/messageCopyFinalizedPrefix.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { sessionTable } from "./sessionTable.js"

export async function sessionRepositoryBranch(
  database: DatabaseExecutor,
  userId: string,
  sourceSessionId: string,
  input: {
    clientRequestId: string
    messageId: string
  },
): Promise<Result<{ created: boolean; session: typeof sessionTable.$inferSelect }>> {
  const op = "sessionRepositoryBranch"

  try {
    const [source] = await database
      .select()
      .from(sessionTable)
      .where(and(eq(sessionTable.id, sourceSessionId), eq(sessionTable.userId, userId)))
      .for("update")
      .limit(1)
    if (source === undefined) return createResultError(op, "The session could not be found.")
    if (source.archivedAt !== null) return createResultError(op, "The session is archived.")

    const [existing] = await database
      .select()
      .from(sessionTable)
      .where(and(eq(sessionTable.userId, userId), eq(sessionTable.clientRequestId, input.clientRequestId)))
      .limit(1)
    if (existing !== undefined) return createResult({ created: false, session: existing })

    const [created] = await database
      .insert(sessionTable)
      .values({
        clientRequestId: input.clientRequestId,
        id: uuidv7(),
        metadata: source.metadata,
        primaryAgentId: source.primaryAgentId,
        serverId: source.serverId,
        title: source.title,
        userId,
      })
      .onConflictDoNothing({ target: [sessionTable.userId, sessionTable.clientRequestId] })
      .returning()

    if (created === undefined) {
      const [idempotent] = await database
        .select()
        .from(sessionTable)
        .where(and(eq(sessionTable.userId, userId), eq(sessionTable.clientRequestId, input.clientRequestId)))
        .limit(1)
      if (idempotent !== undefined) return createResult({ created: false, session: idempotent })
      return createResultError(op, "The branched session could not be created.")
    }

    const copied = await messageCopyFinalizedPrefix(database, userId, sourceSessionId, created.id, input.messageId)
    if (!copied.success) return createResultError(op, copied.errorMessage)

    return createResult({ created: true, session: created })
  } catch (_error) {
    return createResultError(op, "The branched session could not be created.")
  }
}

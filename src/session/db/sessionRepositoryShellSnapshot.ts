import { createResult, createResultError, createResultErrorCode, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import { agentTable } from "../../agents/db/agentTable.js"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { applicationUserTable } from "../../identity/db/applicationUserTable.js"
import { journalSequenceCounterTable } from "../../journal/db/journalSequenceCounterTable.js"
import { projectTable } from "../../project/db/projectTable.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { sessionTable } from "./sessionTable.js"

type SessionRepositoryShellSnapshotDependencies = {
  cursorCodec: {
    encodeDeterministic: (journalId: unknown, sequence: unknown) => Result<string>
  }
}

function sessionShellSnapshotHighestSequence(nextSequence: number | undefined): Result<number> {
  const op = "sessionRepositoryShellSnapshot"
  if (nextSequence === undefined) return createResult(0)
  if (!Number.isSafeInteger(nextSequence) || nextSequence < 1)
    return createResultErrorCode(op, "The authenticated user's journal counter is invalid.", "journal_unavailable")
  return createResult(nextSequence - 1)
}

export async function sessionRepositoryShellSnapshot(
  database: DatabaseClient,
  userId: string,
  organizationId: string,
  sessionId: string,
  dependencies: SessionRepositoryShellSnapshotDependencies,
): Promise<
  Result<{
    asOfCursor: string
    agent: typeof agentTable.$inferSelect
    server: typeof serverTable.$inferSelect
    session: typeof sessionTable.$inferSelect
    projectId: string | null
  }>
> {
  const op = "sessionRepositoryShellSnapshot"

  try {
    return await database.transaction(
      async (transaction) => {
        const [user] = await transaction
          .select({ id: applicationUserTable.id })
          .from(applicationUserTable)
          .where(eq(applicationUserTable.id, userId))
          .limit(1)
        if (user === undefined)
          return createResultErrorCode(
            op,
            "The authenticated application user was not found.",
            "authenticated_user_invalid",
          )

        const [row] = await transaction
          .select({ agent: agentTable, projectId: projectTable.id, server: serverTable, session: sessionTable })
          .from(sessionTable)
          .innerJoin(
            serverTable,
            and(eq(sessionTable.serverId, serverTable.id), eq(serverTable.organizationId, organizationId)),
          )
          .innerJoin(
            agentTable,
            and(eq(sessionTable.primaryAgentId, agentTable.id), eq(agentTable.serverId, sessionTable.serverId)),
          )
          .leftJoin(
            projectTable,
            and(eq(projectTable.userId, sessionTable.userId), eq(projectTable.path, sessionTable.projectPath)),
          )
          .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, user.id)))
          .limit(1)
        if (row === undefined) return createResultErrorCode(op, "The session could not be found.", "session_not_found")

        const [counter] = await transaction
          .select({ nextSequence: journalSequenceCounterTable.nextSequence })
          .from(journalSequenceCounterTable)
          .where(eq(journalSequenceCounterTable.userId, user.id))
          .limit(1)
        const highestSequence = sessionShellSnapshotHighestSequence(counter?.nextSequence)
        if (!highestSequence.success) return highestSequence
        const asOfCursor = dependencies.cursorCodec.encodeDeterministic(user.id, highestSequence.data)
        if (!asOfCursor.success) return createResultError(op, asOfCursor.errorMessage)

        return createResult({ ...row, asOfCursor: asOfCursor.data })
      },
      { behavior: "deferred" },
    )
  } catch (_error) {
    return createResultError(op, "The session shell snapshot could not be loaded.")
  }
}

import { createResult, createResultError, createResultErrorCode, type Result } from "@adaptive-ds/result"
import { and, asc, eq, inArray } from "drizzle-orm"
import * as v from "valibot"
import { agentTable } from "../../agents/db/agentTable.js"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { databaseReadTransactionRun } from "../../database/databaseReadTransactionRun.js"
import { applicationUserTable } from "../../identity/db/applicationUserTable.js"
import { journalSequenceCounterTable } from "../../journal/db/journalSequenceCounterTable.js"
import { messageTable } from "../../message/db/messageTable.js"
import { projectTable } from "../../project/db/projectTable.js"
import { runTable } from "../../run/db/runTable.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { sessionSettledSnapshotRequestSchema } from "../api/sessionSettledSnapshotRequestSchema.js"
import { sessionSettledSnapshotResponseCreate } from "../api/sessionSettledSnapshotResponseCreate.js"
import type { SessionSettledSnapshotResponse } from "../api/sessionSettledSnapshotResponseSchema.js"
import { sessionTable } from "./sessionTable.js"

type SessionSettledSnapshotDependencies = {
  cursorCodec: {
    encodeDeterministic: (journalId: unknown, sequence: unknown) => Result<string>
  }
  etagCreate: (sessionId: string, revision: number, asOfCursor?: string) => string
  schemaVersion: string
}

function sessionSnapshotHighestSequence(nextSequence: number | undefined): Result<number> {
  const op = "sessionRepositorySettledSnapshot"
  if (nextSequence === undefined) return createResult(0)
  if (!Number.isSafeInteger(nextSequence) || nextSequence < 1)
    return createResultErrorCode(op, "The authenticated user's journal counter is invalid.", "journal_unavailable")
  return createResult(nextSequence - 1)
}

export async function sessionRepositorySettledSnapshot(
  database: DatabaseClient,
  userId: string,
  organizationId: string,
  sessionId: string,
  dependencies: SessionSettledSnapshotDependencies,
): Promise<Result<SessionSettledSnapshotResponse>> {
  const op = "sessionRepositorySettledSnapshot"
  const parsedRequest = v.safeParse(sessionSettledSnapshotRequestSchema, { sessionId })
  if (!parsedRequest.success) return createResultError(op, "The settled session snapshot request is invalid.")

  try {
    return await databaseReadTransactionRun(database, async (transaction) => {
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

      const [sessionRow] = await transaction
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
        .where(and(eq(sessionTable.id, parsedRequest.output.sessionId), eq(sessionTable.userId, user.id)))
        .limit(1)
      if (sessionRow === undefined)
        return createResultErrorCode(op, "The session could not be found.", "session_not_found")

      const [activeRun] = await transaction
        .select({ id: runTable.id })
        .from(runTable)
        .where(
          and(
            eq(runTable.userId, user.id),
            eq(runTable.sessionId, sessionRow.session.id),
            inArray(runTable.status, ["accepted", "running"]),
          ),
        )
        .limit(1)
      if (activeRun !== undefined)
        return createResultErrorCode(
          op,
          "The active session cannot be returned as a settled snapshot.",
          "session_active",
        )

      const messages = await transaction
        .select()
        .from(messageTable)
        .where(eq(messageTable.sessionId, sessionRow.session.id))
        .orderBy(asc(messageTable.sequence), asc(messageTable.id))

      const [counter] = await transaction
        .select({ nextSequence: journalSequenceCounterTable.nextSequence })
        .from(journalSequenceCounterTable)
        .where(eq(journalSequenceCounterTable.userId, user.id))
        .limit(1)
      const highestSequence = sessionSnapshotHighestSequence(counter?.nextSequence)
      if (!highestSequence.success) return highestSequence
      const asOfCursor = dependencies.cursorCodec.encodeDeterministic(user.id, highestSequence.data)
      if (!asOfCursor.success) return createResultError(op, asOfCursor.errorMessage)

      return sessionSettledSnapshotResponseCreate({
        asOfCursor: asOfCursor.data,
        asOfSequence: highestSequence.data,
        etag: dependencies.etagCreate(sessionRow.session.id, sessionRow.session.revision),
        messages,
        ...(sessionRow.projectId === null ? {} : { projectId: sessionRow.projectId }),
        revision: sessionRow.session.revision,
        schemaVersion: dependencies.schemaVersion,
        session: sessionRow.session,
        userId,
      })
    })
  } catch (_error) {
    return createResultError(op, "The settled session snapshot could not be loaded.")
  }
}

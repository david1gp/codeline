import { createResult, createResultErrorCode, type Result } from "@adaptive-ds/result"
import { and, asc, eq } from "drizzle-orm"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { databaseReadTransactionRun } from "../../database/databaseReadTransactionRun.js"
import { journalEventTable } from "../../journal/db/journalEventTable.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import { runErrorCodes } from "../errors/runErrorCodes.js"
import { runResultCreateError } from "../errors/runResultCreateError.js"
import { attemptTable } from "./attemptTable.js"
import { runTable } from "./runTable.js"

type RunRepositoryTranscriptLoadResult = {
  attempts: Array<typeof attemptTable.$inferSelect>
  events: Array<typeof journalEventTable.$inferSelect>
  run: typeof runTable.$inferSelect
}

export async function runRepositoryTranscriptLoad(
  database: DatabaseClient,
  userId: string,
  organizationId: string,
  sessionId: string,
  runId: string,
): Promise<Result<RunRepositoryTranscriptLoadResult>> {
  const op = "runRepositoryTranscriptLoad"
  if (userId.trim().length === 0 || organizationId.trim().length === 0)
    return runResultCreateError(op, "The authenticated run scope is required.", runErrorCodes.scopeRequired)
  if (sessionId.trim().length === 0 || runId.trim().length === 0)
    return runResultCreateError(op, "The session and run identifiers are required.", runErrorCodes.identifiersRequired)

  try {
    return await databaseReadTransactionRun(database, async (transaction) => {
      const [run] = await transaction
        .select({ run: runTable })
        .from(runTable)
        .innerJoin(sessionTable, and(eq(runTable.sessionId, sessionTable.id), eq(runTable.userId, sessionTable.userId)))
        .innerJoin(
          serverTable,
          and(eq(sessionTable.serverId, serverTable.id), eq(serverTable.organizationId, organizationId)),
        )
        .where(and(eq(runTable.id, runId), eq(runTable.sessionId, sessionId), eq(runTable.userId, userId)))
        .limit(1)
      if (run === undefined) return createResultErrorCode(op, "The run could not be found.", runErrorCodes.notFound)

      const attempts = await transaction
        .select()
        .from(attemptTable)
        .where(
          and(
            eq(attemptTable.runId, run.run.id),
            eq(attemptTable.sessionId, sessionId),
            eq(attemptTable.userId, userId),
          ),
        )
        .orderBy(asc(attemptTable.ordinal), asc(attemptTable.id))
      const events = await transaction
        .select()
        .from(journalEventTable)
        .where(and(eq(journalEventTable.userId, userId), eq(journalEventTable.runId, run.run.id)))
        .orderBy(asc(journalEventTable.sequence), asc(journalEventTable.id))
      return createResult({ attempts, events, run: run.run })
    })
  } catch (_error) {
    return runResultCreateError(op, "The run transcript could not be loaded.", runErrorCodes.persistFailed)
  }
}

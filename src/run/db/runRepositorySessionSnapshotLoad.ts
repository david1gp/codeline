import { createResult, type Result } from "@adaptive-ds/result"
import { and, asc, eq, inArray } from "drizzle-orm"
import * as v from "valibot"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { databaseReadTransactionRun } from "../../database/databaseReadTransactionRun.js"
import { journalEventTable } from "../../journal/db/journalEventTable.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import {
  type RunSessionSnapshotResponse,
  runSessionSnapshotResponseSchema,
} from "../api/runSessionSnapshotResponseSchema.js"
import { runErrorCodes } from "../errors/runErrorCodes.js"
import { runResultCreateError } from "../errors/runResultCreateError.js"
import { attemptTable } from "./attemptTable.js"
import { runTable } from "./runTable.js"

export async function runRepositorySessionSnapshotLoad(
  database: DatabaseClient,
  userId: string,
  organizationId: string,
  sessionId: string,
): Promise<Result<RunSessionSnapshotResponse>> {
  const op = "runRepositorySessionSnapshotLoad"
  if (userId.trim().length === 0 || organizationId.trim().length === 0)
    return runResultCreateError(op, "The authenticated run scope is required.", runErrorCodes.scopeRequired)
  if (sessionId.trim().length === 0)
    return runResultCreateError(op, "The session identifier is required.", runErrorCodes.sessionIdRequired)

  const loaded = await databaseReadTransactionRun(database, async (transaction) => {
    const [session] = await transaction
      .select({ id: sessionTable.id })
      .from(sessionTable)
      .innerJoin(
        serverTable,
        and(eq(sessionTable.serverId, serverTable.id), eq(serverTable.organizationId, organizationId)),
      )
      .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
      .limit(1)
    if (session === undefined)
      return runResultCreateError(op, "The session could not be found.", runErrorCodes.sessionNotFound)

    const runs = await transaction
      .select({
        cancellationKind: runTable.cancellationKind,
        createdAt: runTable.createdAt,
        failure: runTable.failure,
        id: runTable.id,
        status: runTable.status,
        streamId: runTable.streamId,
      })
      .from(runTable)
      .where(and(eq(runTable.sessionId, sessionId), eq(runTable.userId, userId)))
      .orderBy(asc(runTable.createdAt), asc(runTable.id))

    const runIds = runs.map((run) => run.id)
    const attempts =
      runIds.length === 0
        ? []
        : await transaction
            .select({
              id: attemptTable.id,
              ordinal: attemptTable.ordinal,
              runId: attemptTable.runId,
              status: attemptTable.status,
              streamId: attemptTable.streamId,
            })
            .from(attemptTable)
            .where(
              and(
                eq(attemptTable.userId, userId),
                eq(attemptTable.sessionId, sessionId),
                inArray(attemptTable.runId, runIds),
              ),
            )
            .orderBy(asc(attemptTable.runId), asc(attemptTable.ordinal), asc(attemptTable.id))
    const events =
      runIds.length === 0
        ? []
        : await transaction
            .select({
              eventType: journalEventTable.eventType,
              payload: journalEventTable.payload,
              runId: journalEventTable.runId,
              sequence: journalEventTable.sequence,
            })
            .from(journalEventTable)
            .where(and(eq(journalEventTable.userId, userId), inArray(journalEventTable.runId, runIds)))
            .orderBy(asc(journalEventTable.sequence))

    const attemptsByRun = new Map<string, typeof attempts>()
    for (const attempt of attempts) {
      const current = attemptsByRun.get(attempt.runId) ?? []
      current.push(attempt)
      attemptsByRun.set(attempt.runId, current)
    }
    const runById = new Map(runs.map((run) => [run.id, run]))
    const response = v.safeParse(runSessionSnapshotResponseSchema, {
      events: events.flatMap((event) => {
        const run = runById.get(event.runId ?? "")
        if (run === undefined) return []
        const runAttempts = attemptsByRun.get(run.id) ?? []
        const attempt = runAttempts.at(-1)
        return [
          {
            attemptOrdinal: attempt?.ordinal ?? 1,
            eventType: event.eventType,
            payload: event.payload,
            sequence: event.sequence,
            streamId: attempt?.streamId ?? run.streamId,
          },
        ]
      }),
      runs: runs.map((run) => ({
        attempts: (attemptsByRun.get(run.id) ?? []).map((attempt) => ({
          id: attempt.id,
          ordinal: attempt.ordinal,
          status: attempt.status,
          streamId: attempt.streamId,
        })),
        cancellationKind: run.cancellationKind,
        createdAt: run.createdAt.getTime(),
        failure: run.failure,
        id: run.id,
        status: run.status,
        streamId: run.streamId,
      })),
    })
    if (!response.success)
      return runResultCreateError(op, "The session run snapshot is invalid.", runErrorCodes.sessionSnapshotInvalid)
    return createResult(response.output)
  })
  if (!loaded.success) return loaded
  return loaded
}

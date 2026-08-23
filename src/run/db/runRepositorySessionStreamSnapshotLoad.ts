import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, asc, eq } from "drizzle-orm"
import type { DatabaseClient, DatabaseExecutor } from "../../database/databaseClient.js"
import { databaseReadTransactionRun } from "../../database/databaseReadTransactionRun.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import { streamRepositoryListAfter } from "../../stream/db/streamRepositoryListAfter.js"
import type { RunSessionStreamSnapshotResponse } from "../api/runSessionStreamSnapshotResponseSchema.js"
import { attemptTable } from "./attemptTable.js"
import { runTable } from "./runTable.js"

const streamEventPageLimit = 100

async function runRepositorySessionStreamEventsLoad(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  streamId: string,
): Promise<Result<RunSessionStreamSnapshotResponse["events"]>> {
  const events: RunSessionStreamSnapshotResponse["events"] = []
  let afterSequence = 0

  while (true) {
    const page = await streamRepositoryListAfter(database, userId, sessionId, streamId, {
      afterSequence,
      limit: streamEventPageLimit,
    })
    if (!page.success) return createResultError("runRepositorySessionStreamSnapshotLoad", page.errorMessage)
    if (page.data.length === 0) return createResult(events)

    events.push(
      ...page.data.map((event) => ({
        createdAt: event.createdAt.getTime(),
        eventType: event.eventType,
        id: event.id,
        payload: event.payload,
        sequence: event.sequence,
        streamId: event.streamId,
      })),
    )

    const nextAfterSequence = page.data.at(-1)?.sequence
    if (nextAfterSequence === undefined || nextAfterSequence <= afterSequence) {
      return createResultError("runRepositorySessionStreamSnapshotLoad", "The stream event ordering is invalid.")
    }
    afterSequence = nextAfterSequence
    if (page.data.length < streamEventPageLimit) return createResult(events)
  }
}

function runRepositorySessionStreamSnapshotEventsOrder(
  left: RunSessionStreamSnapshotResponse["events"][number],
  right: RunSessionStreamSnapshotResponse["events"][number],
): number {
  return (
    left.createdAt - right.createdAt ||
    left.streamId.localeCompare(right.streamId) ||
    left.sequence - right.sequence ||
    left.id.localeCompare(right.id)
  )
}

export async function runRepositorySessionStreamSnapshotLoad(
  database: DatabaseClient,
  userId: string,
  organizationId: string,
  sessionId: string,
): Promise<Result<RunSessionStreamSnapshotResponse>> {
  const op = "runRepositorySessionStreamSnapshotLoad"

  try {
    return await databaseReadTransactionRun(database, async (transaction) => {
      const [authorizedSession] = await transaction
        .select({ id: sessionTable.id })
        .from(sessionTable)
        .innerJoin(
          serverTable,
          and(eq(sessionTable.serverId, serverTable.id), eq(serverTable.organizationId, organizationId)),
        )
        .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
        .limit(1)
      if (authorizedSession === undefined) return createResultError(op, "The session could not be found.")

      const runs = await transaction
        .select()
        .from(runTable)
        .where(and(eq(runTable.sessionId, sessionId), eq(runTable.userId, userId)))
        .orderBy(asc(runTable.createdAt), asc(runTable.id))
      const attempts = await transaction
        .select()
        .from(attemptTable)
        .where(and(eq(attemptTable.sessionId, sessionId), eq(attemptTable.userId, userId)))
        .orderBy(asc(attemptTable.runId), asc(attemptTable.ordinal), asc(attemptTable.id))

      const attemptsByRunId = new Map<string, Array<(typeof attempts)[number]>>()
      for (const attempt of attempts) {
        const runAttempts = attemptsByRunId.get(attempt.runId)
        if (runAttempts === undefined) attemptsByRunId.set(attempt.runId, [attempt])
        else runAttempts.push(attempt)
      }

      const normalizedRuns: RunSessionStreamSnapshotResponse["runs"] = runs.map((run) => ({
        attempts: (attemptsByRunId.get(run.id) ?? []).map((attempt) => ({
          id: attempt.id,
          ordinal: attempt.ordinal,
          status: attempt.status,
          streamId: attempt.streamId,
        })),
        cancellationKind: run.cancellationKind,
        clientRunId: run.clientRunId,
        createdAt: run.createdAt.getTime(),
        id: run.id,
        snapshot: run.snapshot,
        status: run.status,
        streamId: run.streamId,
      }))

      const streamIds = [
        ...new Set(normalizedRuns.flatMap((run) => [run.streamId, ...run.attempts.map((attempt) => attempt.streamId)])),
      ]
      const events: RunSessionStreamSnapshotResponse["events"] = []
      for (const streamId of streamIds) {
        const loaded = await runRepositorySessionStreamEventsLoad(transaction, userId, sessionId, streamId)
        if (!loaded.success) return loaded
        events.push(...loaded.data)
      }
      events.sort(runRepositorySessionStreamSnapshotEventsOrder)

      return createResult({ events, runs: normalizedRuns })
    })
  } catch (_error) {
    return createResultError(op, "The session stream snapshot could not be loaded.")
  }
}

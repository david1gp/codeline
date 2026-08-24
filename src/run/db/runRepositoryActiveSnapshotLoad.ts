import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, asc, eq } from "drizzle-orm"
import * as v from "valibot"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { databaseReadTransactionRun } from "../../database/databaseReadTransactionRun.js"
import { journalEventTable } from "../../journal/db/journalEventTable.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import { streamProducerDeltaSchema } from "../../stream/schema/streamProducerDeltaSchema.js"
import {
  type RunActiveSnapshotResponse,
  runActiveSnapshotResponseSchema,
} from "../api/runActiveSnapshotResponseSchema.js"
import { runTable } from "./runTable.js"

type RunActiveSnapshotCursorEncode = (journalId: unknown, sequence: unknown) => Result<string>

export async function runRepositoryActiveSnapshotLoad(
  database: DatabaseClient,
  userId: string,
  organizationId: string,
  sessionId: string,
  runId: string,
  dependencies: { cursorEncode?: RunActiveSnapshotCursorEncode } = {},
): Promise<Result<RunActiveSnapshotResponse>> {
  const op = "runRepositoryActiveSnapshotLoad"
  if (userId.trim().length === 0 || organizationId.trim().length === 0)
    return createResultError(op, "The authenticated run scope is required.")
  if (sessionId.trim().length === 0 || runId.trim().length === 0)
    return createResultError(op, "The session and run identifiers are required.")

  const loaded = await databaseReadTransactionRun(database, async (transaction) => {
    const [run] = await transaction
      .select({ id: runTable.id, status: runTable.status })
      .from(runTable)
      .innerJoin(sessionTable, and(eq(runTable.sessionId, sessionTable.id), eq(runTable.userId, sessionTable.userId)))
      .innerJoin(
        serverTable,
        and(eq(sessionTable.serverId, serverTable.id), eq(serverTable.organizationId, organizationId)),
      )
      .where(and(eq(runTable.id, runId), eq(runTable.sessionId, sessionId), eq(runTable.userId, userId)))
      .limit(1)
    if (run === undefined) return createResultError(op, "The run could not be found.")

    const status = v.safeParse(runActiveSnapshotResponseSchema.entries.status, run.status)
    if (!status.success) return createResultError(op, "The run status is invalid.")

    const deltas = await transaction
      .select({ payload: journalEventTable.payload, sequence: journalEventTable.sequence })
      .from(journalEventTable)
      .where(
        and(
          eq(journalEventTable.userId, userId),
          eq(journalEventTable.runId, run.id),
          eq(journalEventTable.eventType, "delta"),
        ),
      )
      .orderBy(asc(journalEventTable.sequence))

    let partialText = ""
    let lastSequence = 0
    for (const delta of deltas) {
      const parsed = v.safeParse(streamProducerDeltaSchema, delta.payload)
      if (!parsed.success || parsed.output.runId !== run.id || parsed.output.sessionId !== sessionId)
        return createResultError(op, "The persisted run delta is invalid.")
      lastSequence = delta.sequence
      if (parsed.output.deltaKind === "text") partialText += parsed.output.delta
    }

    let lastCursor: string | null = null
    if (lastSequence > 0 && dependencies.cursorEncode !== undefined) {
      const encoded = dependencies.cursorEncode(userId, lastSequence)
      if (!encoded.success) return createResultError(op, "The active run cursor could not be encoded.")
      lastCursor = encoded.data
    }

    const response = v.safeParse(runActiveSnapshotResponseSchema, {
      lastCursor,
      lastSequence,
      partialText,
      status: status.output,
    })
    if (!response.success) return createResultError(op, "The active run snapshot is invalid.")
    return createResult(response.output)
  })
  if (!loaded.success) return createResultError(op, loaded.errorMessage)
  return loaded
}

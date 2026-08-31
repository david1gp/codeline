import { createResult, createResultError, createResultErrorCode, type Result } from "@adaptive-ds/result"
import { and, asc, desc, eq, inArray, isNotNull, lte } from "drizzle-orm"
import * as v from "valibot"
import { agentTable } from "../../agents/db/agentTable.js"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { databaseReadTransactionRun } from "../../database/databaseReadTransactionRun.js"
import { applicationUserTable } from "../../identity/db/applicationUserTable.js"
import { journalEventTable } from "../../journal/db/journalEventTable.js"
import { journalSequenceCounterTable } from "../../journal/db/journalSequenceCounterTable.js"
import { messageTable } from "../../message/db/messageTable.js"
import { attemptTable } from "../../run/db/attemptTable.js"
import { runTable } from "../../run/db/runTable.js"
import { runStatusSchema } from "../../run/schema/runStatusSchema.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { streamProducerDeltaSchema } from "../../stream/schema/streamProducerDeltaSchema.js"
import { sessionBoundedSnapshotCreate } from "../api/sessionBoundedSnapshotCreate.js"
import type { SessionBoundedSnapshot } from "../api/sessionBoundedSnapshotSchema.js"
import { sessionSettledSnapshotRequestSchema } from "../api/sessionSettledSnapshotRequestSchema.js"
import { sessionBoundedSemanticStepsCreate } from "./sessionBoundedSemanticStepsCreate.js"
import { sessionDelegationReferencesLoad } from "./sessionDelegationReferencesLoad.js"
import { sessionTable } from "./sessionTable.js"

type SessionBoundedSnapshotDependencies = {
  cursorCodec: {
    encodePayload?: (payload: unknown) => Result<string>
  }
}

const sessionBoundedSnapshotLimit = 25

function sessionBoundedSnapshotHighestSequence(nextSequence: number | undefined): Result<number> {
  const op = "sessionRepositoryBoundedSnapshot"
  if (nextSequence === undefined) return createResult(0)
  if (!Number.isSafeInteger(nextSequence) || nextSequence < 1)
    return createResultErrorCode(op, "The authenticated user's journal counter is invalid.", "journal_unavailable")
  return createResult(nextSequence - 1)
}

function sessionBoundedSnapshotSummary(content: string): string {
  return content.slice(0, 16_384)
}

function sessionBoundedSnapshotOlderCursorCreate(
  dependencies: SessionBoundedSnapshotDependencies,
  input: {
    id: string
    messageThroughSeq: number
    sequence: number
    sessionId: string
    throughSeq: number
    userId: string
  },
): Result<string> {
  const op = "sessionRepositoryBoundedSnapshot"
  if (dependencies.cursorCodec.encodePayload === undefined)
    return createResultError(op, "The older session cursor could not be encoded.")
  return dependencies.cursorCodec.encodePayload({
    boundary: { id: input.id, sequence: input.sequence },
    kind: "session-older",
    messageThroughSeq: input.messageThroughSeq,
    sessionId: input.sessionId,
    throughSeq: input.throughSeq,
    userId: input.userId,
    version: 1,
  })
}

export async function sessionRepositoryBoundedSnapshot(
  database: DatabaseClient,
  userId: string,
  organizationId: string,
  sessionId: string,
  dependencies: SessionBoundedSnapshotDependencies,
): Promise<Result<SessionBoundedSnapshot>> {
  const op = "sessionRepositoryBoundedSnapshot"
  const parsedRequest = v.safeParse(sessionSettledSnapshotRequestSchema, { sessionId })
  if (!parsedRequest.success) return createResultError(op, "The bounded session snapshot request is invalid.")

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
        .select({
          session: {
            id: sessionTable.id,
            pinned: sessionTable.pinned,
            projectPath: sessionTable.projectPath,
            revision: sessionTable.revision,
            title: sessionTable.title,
          },
        })
        .from(sessionTable)
        .innerJoin(
          serverTable,
          and(eq(sessionTable.serverId, serverTable.id), eq(serverTable.organizationId, organizationId)),
        )
        .innerJoin(
          agentTable,
          and(eq(sessionTable.primaryAgentId, agentTable.id), eq(agentTable.serverId, sessionTable.serverId)),
        )
        .where(and(eq(sessionTable.id, parsedRequest.output.sessionId), eq(sessionTable.userId, user.id)))
        .limit(1)
      if (sessionRow === undefined)
        return createResultErrorCode(op, "The session could not be found.", "session_not_found")

      const [counter] = await transaction
        .select({ nextSequence: journalSequenceCounterTable.nextSequence })
        .from(journalSequenceCounterTable)
        .where(eq(journalSequenceCounterTable.userId, user.id))
        .limit(1)
      const highestSequence = sessionBoundedSnapshotHighestSequence(counter?.nextSequence)
      if (!highestSequence.success) return highestSequence

      const messages = await transaction
        .select()
        .from(messageTable)
        .where(and(eq(messageTable.sessionId, sessionRow.session.id), isNotNull(messageTable.finalizedAt)))
        .orderBy(asc(messageTable.sequence), asc(messageTable.id))
      const messageThroughSeq = messages.at(-1)?.sequence ?? 0

      const runs = await transaction
        .select()
        .from(runTable)
        .where(and(eq(runTable.userId, user.id), eq(runTable.sessionId, sessionRow.session.id)))
        .orderBy(asc(runTable.createdAt), asc(runTable.id))
      const runIds = runs.map((run) => run.id)
      const attempts =
        runIds.length === 0
          ? []
          : await transaction
              .select()
              .from(attemptTable)
              .where(and(eq(attemptTable.userId, user.id), eq(attemptTable.sessionId, sessionRow.session.id)))
              .orderBy(asc(attemptTable.runId), asc(attemptTable.ordinal), asc(attemptTable.id))
      const runEvents =
        runIds.length === 0
          ? []
          : await transaction
              .select()
              .from(journalEventTable)
              .where(
                and(
                  eq(journalEventTable.userId, user.id),
                  inArray(journalEventTable.runId, runIds),
                  lte(journalEventTable.sequence, highestSequence.data),
                ),
              )
              .orderBy(asc(journalEventTable.sequence), asc(journalEventTable.id))
      const delegationReferences = await sessionDelegationReferencesLoad(
        transaction,
        user.id,
        organizationId,
        sessionRow.session.id,
      )
      if (!delegationReferences.success) return delegationReferences
      const allSemanticSteps = sessionBoundedSemanticStepsCreate({
        attempts,
        delegationReferences: delegationReferences.data.byToolKey,
        events: runEvents,
        maxSequence: highestSequence.data,
        messages,
        runs,
      })
      if (!allSemanticSteps.success) return allSemanticSteps
      const pageSteps = allSemanticSteps.data.slice(-sessionBoundedSnapshotLimit)
      const semanticSteps: SessionBoundedSnapshot["semanticSteps"] = pageSteps

      const [latestAnswer] = await transaction
        .select()
        .from(messageTable)
        .where(
          and(
            eq(messageTable.sessionId, sessionRow.session.id),
            eq(messageTable.role, "assistant"),
            isNotNull(messageTable.finalizedAt),
          ),
        )
        .orderBy(desc(messageTable.sequence), desc(messageTable.id))
        .limit(1)

      const [activeRun] = await transaction
        .select()
        .from(runTable)
        .where(
          and(
            eq(runTable.userId, user.id),
            eq(runTable.sessionId, sessionRow.session.id),
            inArray(runTable.status, ["accepted", "running"]),
          ),
        )
        .orderBy(desc(runTable.updatedAt), desc(runTable.id))
        .limit(1)

      // No supported runtime currently persists an authoritative input-needed event or status.
      // In particular, tool names and active-run status are not input evidence.
      let state: SessionBoundedSnapshot["state"] = { input: null, run: null }
      if (activeRun !== undefined) {
        const status = v.safeParse(runStatusSchema, activeRun.status)
        if (!status.success) return createResultError(op, "The active run status is invalid.")

        const deltas = await transaction
          .select({ payload: journalEventTable.payload, sequence: journalEventTable.sequence })
          .from(journalEventTable)
          .where(
            and(
              eq(journalEventTable.userId, user.id),
              eq(journalEventTable.runId, activeRun.id),
              eq(journalEventTable.eventType, "delta"),
              lte(journalEventTable.sequence, highestSequence.data),
            ),
          )
          .orderBy(asc(journalEventTable.sequence))

        let partialText = ""
        let lastSequence = 0
        for (const delta of deltas) {
          const parsedDelta = v.safeParse(streamProducerDeltaSchema, delta.payload)
          if (
            !parsedDelta.success ||
            parsedDelta.output.runId !== activeRun.id ||
            parsedDelta.output.sessionId !== sessionRow.session.id
          )
            return createResultError(op, "The persisted run delta is invalid.")
          lastSequence = delta.sequence
          if (parsedDelta.output.deltaKind === "text") partialText += parsedDelta.output.delta
        }

        state = {
          input: null,
          run: {
            lastSequence,
            partialText: sessionBoundedSnapshotSummary(partialText),
            runId: activeRun.id,
            sessionId: sessionRow.session.id,
            status: status.output,
          },
        }
      }

      const hasMore = allSemanticSteps.data.length > sessionBoundedSnapshotLimit
      let olderCursor: string | null = null
      const oldestStep = pageSteps[0]
      if (hasMore && oldestStep !== undefined) {
        const encoded = sessionBoundedSnapshotOlderCursorCreate(dependencies, {
          id: oldestStep.id,
          messageThroughSeq,
          sequence: oldestStep.sequence,
          sessionId: sessionRow.session.id,
          throughSeq: highestSequence.data,
          userId: user.id,
        })
        if (!encoded.success) return encoded
        olderCursor = encoded.data
      }

      return sessionBoundedSnapshotCreate({
        hasMore,
        latestAnswer: latestAnswer ?? null,
        olderCursor,
        semanticSteps,
        session: sessionRow.session,
        state,
        throughSeq: highestSequence.data,
      })
    })
  } catch (_error) {
    return createResultError(op, "The bounded session snapshot could not be loaded.")
  }
}

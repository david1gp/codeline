import { createResult, createResultError, createResultErrorCode, type Result } from "@adaptive-ds/result"
import { and, desc, eq, inArray, lte } from "drizzle-orm"
import * as v from "valibot"
import { agentTable } from "../../agents/db/agentTable.js"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { databaseReadTransactionRun } from "../../database/databaseReadTransactionRun.js"
import { applicationUserTable } from "../../identity/db/applicationUserTable.js"
import { messageApiRecordCreate } from "../../message/api/messageApiRecordCreate.js"
import { runActiveStateTable } from "../../run/db/runActiveStateTable.js"
import { runTable } from "../../run/db/runTable.js"
import { runStatusSchema } from "../../run/schema/runStatusSchema.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { sessionBoundedSnapshotCreate } from "../api/sessionBoundedSnapshotCreate.js"
import type { SessionBoundedSnapshot } from "../api/sessionBoundedSnapshotSchema.js"
import { sessionBoundedSnapshotRequestSchema } from "../api/sessionBoundedSnapshotRequestSchema.js"
import { sessionSnapshotWatermarkSchema } from "../api/sessionSnapshotWatermarkSchema.js"
import { sessionHistoryEntrySemanticStepCreate } from "./sessionHistoryEntrySemanticStepCreate.js"
import { sessionHistoryEntryTable } from "./sessionHistoryEntryTable.js"
import { sessionTable } from "./sessionTable.js"

type SessionBoundedSnapshotDependencies = {
  cursorCodec: {
    encodePayload?: (payload: unknown) => Result<string>
    encodeSessionPosition?: (userId: unknown, sessionId: unknown, changePosition: unknown) => Result<string>
  }
}

const sessionBoundedSnapshotLimit = 25

function sessionBoundedSnapshotThroughPosition(nextHistoryPosition: number): Result<number> {
  const op = "sessionRepositoryBoundedSnapshot"
  const throughPosition = v.safeParse(sessionSnapshotWatermarkSchema, nextHistoryPosition - 1)
  if (!throughPosition.success)
    return createResultErrorCode(op, "The session history position counter is invalid.", "history_unavailable")
  return createResult(throughPosition.output)
}

function sessionBoundedSnapshotSummary(content: string): string {
  return content.slice(0, 16_384)
}

function sessionBoundedSnapshotOlderCursorCreate(
  dependencies: SessionBoundedSnapshotDependencies,
  input: {
    beforePosition: number
    sessionId: string
    throughPosition: number
    userId: string
  },
): Result<string> {
  const op = "sessionRepositoryBoundedSnapshot"
  if (dependencies.cursorCodec.encodePayload === undefined)
    return createResultError(op, "The older session cursor could not be encoded.")
  return dependencies.cursorCodec.encodePayload({
    beforePosition: input.beforePosition,
    kind: "session-older",
    sessionId: input.sessionId,
    throughPosition: input.throughPosition,
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
  const parsedRequest = v.safeParse(sessionBoundedSnapshotRequestSchema, { sessionId })
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
          nextHistoryPosition: sessionTable.nextHistoryPosition,
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

      const throughPosition = sessionBoundedSnapshotThroughPosition(sessionRow.nextHistoryPosition)
      if (!throughPosition.success) return throughPosition

      const projectedEntries = await transaction
        .select()
        .from(sessionHistoryEntryTable)
        .where(
          and(
            eq(sessionHistoryEntryTable.userId, user.id),
            eq(sessionHistoryEntryTable.sessionId, sessionRow.session.id),
            lte(sessionHistoryEntryTable.position, throughPosition.data),
          ),
        )
        .orderBy(desc(sessionHistoryEntryTable.position))
        .limit(sessionBoundedSnapshotLimit + 1)
      const pageEntries = projectedEntries.slice(0, sessionBoundedSnapshotLimit)
      const semanticSteps: SessionBoundedSnapshot["semanticSteps"] = []
      for (const entry of pageEntries.toReversed()) {
        const step = sessionHistoryEntrySemanticStepCreate(entry)
        if (!step.success) return step
        semanticSteps.push(step.data)
      }

      const latestAnswerEntries = await transaction
        .select()
        .from(sessionHistoryEntryTable)
        .where(
          and(
            eq(sessionHistoryEntryTable.userId, user.id),
            eq(sessionHistoryEntryTable.sessionId, sessionRow.session.id),
            eq(sessionHistoryEntryTable.kind, "message"),
            eq(sessionHistoryEntryTable.messageRole, "assistant"),
            lte(sessionHistoryEntryTable.position, throughPosition.data),
          ),
        )
        .orderBy(desc(sessionHistoryEntryTable.position))
        .limit(1)

      let latestAnswer: Parameters<typeof messageApiRecordCreate>[0] | null = null
      const latestAnswerEntry = latestAnswerEntries[0]
      if (
        latestAnswerEntry?.payload !== null &&
        typeof latestAnswerEntry?.payload === "object" &&
        !Array.isArray(latestAnswerEntry.payload) &&
        latestAnswerEntry.payload.role === "assistant"
      )
        latestAnswer = latestAnswerEntry.payload as Parameters<typeof messageApiRecordCreate>[0]

      const [activeRun] = await transaction
        .select({
          activeState: {
            lastSequence: runActiveStateTable.lastSequence,
            partialText: runActiveStateTable.partialText,
          },
          runId: runTable.id,
          runStatus: runTable.status,
        })
        .from(runTable)
        .leftJoin(
          runActiveStateTable,
          and(
            eq(runActiveStateTable.runId, runTable.id),
            eq(runActiveStateTable.sessionId, runTable.sessionId),
            eq(runActiveStateTable.userId, runTable.userId),
          ),
        )
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
        const status = v.safeParse(runStatusSchema, activeRun.runStatus)
        if (!status.success) return createResultError(op, "The active run status is invalid.")
        const activeState = activeRun.activeState
        if (activeState === null || activeState === undefined)
          return createResultError(op, "The active run state could not be found.")

        state = {
          input: null,
          run: {
            lastSequence: activeState.lastSequence,
            partialText: sessionBoundedSnapshotSummary(activeState.partialText),
            runId: activeRun.runId,
            sessionId: sessionRow.session.id,
            status: status.output,
          },
        }
      }

      const hasMore = projectedEntries.length > sessionBoundedSnapshotLimit
      if (dependencies.cursorCodec.encodeSessionPosition === undefined)
        return createResultError(op, "The selected-session cursor could not be encoded.")
      const detailCursor = dependencies.cursorCodec.encodeSessionPosition(
        user.id,
        sessionRow.session.id,
        throughPosition.data,
      )
      if (!detailCursor.success) return createResultError(op, detailCursor.errorMessage)
      let olderCursor: string | null = null
      const oldestEntry = pageEntries.at(-1)
      if (hasMore && oldestEntry !== undefined) {
        const encoded = sessionBoundedSnapshotOlderCursorCreate(dependencies, {
          beforePosition: oldestEntry.position,
          sessionId: sessionRow.session.id,
          throughPosition: throughPosition.data,
          userId: user.id,
        })
        if (!encoded.success) return encoded
        olderCursor = encoded.data
      }

      return sessionBoundedSnapshotCreate({
        detailCursor: detailCursor.data,
        hasMore,
        latestAnswer: latestAnswer ?? null,
        olderCursor,
        semanticSteps,
        session: sessionRow.session,
        state,
        throughPosition: throughPosition.data,
      })
    })
  } catch (_error) {
    return createResultError(op, "The bounded session snapshot could not be loaded.")
  }
}

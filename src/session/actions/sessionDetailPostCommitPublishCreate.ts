import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq, gte, or } from "drizzle-orm"
import type { DatabaseClient } from "../../database/databaseClient.js"
import type { JournalCursorCodec } from "../../journal/actions/journalCursorCodecCreate.js"
import type { journalEventTable } from "../../journal/db/journalEventTable.js"
import type { SessionDetailSseFrame } from "../api/sessionDetailSseFrameSchema.js"
import { sessionDetailSseFrameCreate } from "../api/sessionDetailSseFrameCreate.js"
import { sessionHistoryEntryTable } from "../db/sessionHistoryEntryTable.js"

type SessionDetailPostCommitEvent = typeof journalEventTable.$inferSelect

type SessionDetailPostCommitPublishCreateDependencies = {
  cursorCodec: Pick<JournalCursorCodec, "encodeSessionPosition">
  database: DatabaseClient
  liveSubscription: {
    selectedSessionDetailPublish: (userId: string, sessionId: string, event: SessionDetailSseFrame) => void
  }
}

type SessionDetailEventPayload = Record<string, unknown>

function sessionDetailEventPayloadRecord(payload: unknown): SessionDetailEventPayload {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return {}
  return payload as SessionDetailEventPayload
}

function sessionDetailEventSessionId(event: SessionDetailPostCommitEvent): string | undefined {
  const payload = sessionDetailEventPayloadRecord(event.payload)
  if (typeof payload.sessionId === "string") return payload.sessionId
  if (event.eventType === "invalidate" && payload.resourceType === "session" && typeof payload.resourceId === "string")
    return payload.resourceId
  return undefined
}

function sessionDetailEventRunId(event: SessionDetailPostCommitEvent): string | undefined {
  const payload = sessionDetailEventPayloadRecord(event.payload)
  if (typeof payload.runId === "string") return payload.runId
  if (event.runId !== null) return event.runId
  if (event.eventType === "invalidate" && payload.resourceType === "run" && typeof payload.resourceId === "string")
    return payload.resourceId
  return undefined
}

function sessionDetailEventMessageId(event: SessionDetailPostCommitEvent): string | undefined {
  const payload = sessionDetailEventPayloadRecord(event.payload)
  return typeof payload.messageId === "string" ? payload.messageId : undefined
}

function sessionDetailChangedEntryWhere(
  event: SessionDetailPostCommitEvent,
  sessionId: string,
): ReturnType<typeof and> | undefined {
  const runId = sessionDetailEventRunId(event)
  const messageId = sessionDetailEventMessageId(event)
  if (runId !== undefined)
    return and(
      eq(sessionHistoryEntryTable.sessionId, sessionId),
      or(
        and(eq(sessionHistoryEntryTable.sourceType, "run"), eq(sessionHistoryEntryTable.sourceId, runId)),
        and(eq(sessionHistoryEntryTable.sourceType, "tool"), eq(sessionHistoryEntryTable.sourceId, runId)),
        ...(messageId === undefined
          ? []
          : [
              and(eq(sessionHistoryEntryTable.sourceType, "message"), eq(sessionHistoryEntryTable.sourceId, messageId)),
            ]),
      ),
    )

  if (messageId !== undefined)
    return and(
      eq(sessionHistoryEntryTable.sessionId, sessionId),
      eq(sessionHistoryEntryTable.sourceType, "message"),
      eq(sessionHistoryEntryTable.sourceId, messageId),
    )

  if (event.eventType !== "invalidate") return undefined
  return and(
    eq(sessionHistoryEntryTable.sessionId, sessionId),
    gte(sessionHistoryEntryTable.updatedAt, new Date(event.createdAt.getTime() - 1_000)),
  )
}

export function sessionDetailPostCommitPublishCreate(dependencies: SessionDetailPostCommitPublishCreateDependencies) {
  return async (events: readonly SessionDetailPostCommitEvent[]): Promise<Result<void>> => {
    const op = "sessionDetailPostCommitPublish"
    if (dependencies.cursorCodec.encodeSessionPosition === undefined)
      return createResultError(op, "The selected-session cursor is unavailable.")

    const entriesByKey = new Map<string, typeof sessionHistoryEntryTable.$inferSelect>()
    try {
      for (const event of events) {
        const sessionId = sessionDetailEventSessionId(event)
        if (sessionId === undefined) continue
        const where = sessionDetailChangedEntryWhere(event, sessionId)
        if (where === undefined) continue
        const entries = await dependencies.database
          .select()
          .from(sessionHistoryEntryTable)
          .where(and(eq(sessionHistoryEntryTable.userId, event.userId), where))
        for (const entry of entries)
          entriesByKey.set(`${entry.sessionId}\u0000${entry.id}\u0000${entry.changePosition}`, entry)
      }
    } catch (_error) {
      return createResultError(op, "The selected-session projection changes could not be loaded.")
    }

    const frames: Array<{ frame: SessionDetailSseFrame; sessionId: string; userId: string }> = []
    for (const entry of entriesByKey.values()) {
      const frame = sessionDetailSseFrameCreate({ cursorEncode: dependencies.cursorCodec.encodeSessionPosition }, entry)
      if (!frame.success) return createResultError(op, frame.errorMessage)
      frames.push({ frame: frame.data, sessionId: entry.sessionId, userId: entry.userId })
    }

    frames.sort((left, right) => {
      if (left.userId !== right.userId) return left.userId.localeCompare(right.userId)
      if (left.sessionId !== right.sessionId) return left.sessionId.localeCompare(right.sessionId)
      const leftPosition = left.frame.data.eventType === "entry" ? left.frame.data.changePosition : 0
      const rightPosition = right.frame.data.eventType === "entry" ? right.frame.data.changePosition : 0
      return leftPosition - rightPosition
    })
    for (const { frame, sessionId, userId } of frames)
      dependencies.liveSubscription.selectedSessionDetailPublish(userId, sessionId, frame)
    return createResult(undefined)
  }
}

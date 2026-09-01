import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { IDBPDatabase } from "idb"
import * as v from "valibot"
import type { SessionBoundedHistoryPage } from "../api/sessionBoundedHistoryPageSchema.js"
import { sessionBoundedHistoryPageSchema } from "../api/sessionBoundedHistoryPageSchema.js"
import { sessionOlderPageCursorSchema } from "../api/sessionOlderPageCursorSchema.js"
import {
  type SessionCacheHistoryEntryRecord,
  sessionCacheHistoryEntryRecordSchema,
} from "../schema/sessionCacheHistoryEntryRecordSchema.js"
import { sessionCacheHistoryPageRecordSchema } from "../schema/sessionCacheHistoryPageRecordSchema.js"
import { type SessionCacheLimits, sessionCacheDatabaseConfig } from "./sessionCacheDatabaseConfig.js"
import type { SessionCacheDatabaseSchema } from "./sessionCacheDatabaseSchema.js"
import { sessionCacheRecordByteSize } from "./sessionCacheRecordByteSize.js"
import { sessionCacheWrite } from "./sessionCacheWrite.js"

export async function sessionCacheHistoryPageWrite(
  database: IDBPDatabase<SessionCacheDatabaseSchema>,
  input: {
    limits?: SessionCacheLimits
    page: SessionBoundedHistoryPage
    requestCursor: string
    sessionId: string
    storedAt: number
    userId: string
  },
): Promise<Result<void>> {
  const op = "sessionCacheHistoryPageWrite"
  const parsedPage = v.safeParse(sessionBoundedHistoryPageSchema, input.page)
  const parsedCursor = v.safeParse(sessionOlderPageCursorSchema, input.requestCursor)
  if (!parsedPage.success || !parsedCursor.success) {
    return createResultError(op, "The bounded session history page is invalid.")
  }
  const entryIds = parsedPage.output.semanticSteps.map((entry) => entry.id)
  const positions = parsedPage.output.semanticSteps.map((entry) => entry.sequence)
  if (new Set(entryIds).size !== entryIds.length || new Set(positions).size !== positions.length) {
    return createResultError(op, "The bounded session history page has duplicate projected entries.")
  }

  const entryRecords: SessionCacheHistoryEntryRecord[] = []
  for (const entry of parsedPage.output.semanticSteps) {
    const withoutSize = {
      entryId: entry.id,
      pageCursor: parsedCursor.output,
      payload: entry,
      position: entry.sequence,
      schemaVersion: sessionCacheDatabaseConfig.recordSchemaVersion,
      sessionId: input.sessionId,
      storedAt: input.storedAt,
      throughPosition: parsedPage.output.throughPosition,
      userId: input.userId,
    }
    const byteSize = sessionCacheRecordByteSize(withoutSize)
    if (!byteSize.success) return createResultError(op, byteSize.errorMessage)
    const parsed = v.safeParse(sessionCacheHistoryEntryRecordSchema, { ...withoutSize, byteSize: byteSize.data })
    if (!parsed.success) return createResultError(op, "A session cache history entry is invalid.")
    entryRecords.push(parsed.output)
  }

  const pageWithoutSize = {
    entryIds,
    hasMore: parsedPage.output.hasMore,
    nextCursor: parsedPage.output.nextCursor,
    requestCursor: parsedCursor.output,
    schemaVersion: sessionCacheDatabaseConfig.recordSchemaVersion,
    sessionId: input.sessionId,
    storedAt: input.storedAt,
    throughPosition: parsedPage.output.throughPosition,
    userId: input.userId,
  }
  const pageSize = sessionCacheRecordByteSize(pageWithoutSize)
  if (!pageSize.success) return createResultError(op, pageSize.errorMessage)
  const pageRecord = v.safeParse(sessionCacheHistoryPageRecordSchema, { ...pageWithoutSize, byteSize: pageSize.data })
  if (!pageRecord.success) return createResultError(op, "The session cache history page metadata is invalid.")

  const limits = input.limits ?? sessionCacheDatabaseConfig.limits
  if (pageRecord.output.byteSize > limits.maxPageMetadataBytes) {
    return createResultError(op, "The session cache history page metadata exceeds its byte limit.")
  }
  if (entryRecords.some((record) => record.byteSize > limits.maxHistoryEntryBytes)) {
    return createResultError(op, "A session cache history entry exceeds its byte limit.")
  }

  const written = await sessionCacheWrite(
    database,
    { sessionId: input.sessionId, userId: input.userId },
    async (transaction) => {
      const snapshot = await transaction.objectStore("sessionSnapshots").get([input.userId, input.sessionId])
      if (snapshot === undefined || snapshot.payload.throughPosition !== parsedPage.output.throughPosition) {
        throw new DOMException("History page snapshot watermark mismatch.", "DataError")
      }
      const pageStore = transaction.objectStore("historyPages")
      const oldPage = await pageStore.get([input.userId, input.sessionId, parsedCursor.output])
      const entryStore = transaction.objectStore("historyEntries")
      for (const record of entryRecords) {
        const existing = await entryStore.get([input.userId, input.sessionId, record.entryId])
        if (
          snapshot.entryIds.includes(record.entryId) ||
          (existing !== undefined && existing.pageCursor !== parsedCursor.output)
        ) {
          throw new DOMException("History pages cannot overwrite another cached page or the snapshot.", "DataError")
        }
      }
      for (const oldEntryId of oldPage?.entryIds ?? []) {
        if (!entryIds.includes(oldEntryId) && !snapshot.entryIds.includes(oldEntryId)) {
          await entryStore.delete([input.userId, input.sessionId, oldEntryId])
        }
      }
      for (const record of entryRecords) await entryStore.put(record)
      await pageStore.put(pageRecord.output)
    },
    limits,
  )
  if (!written.success) return createResultError(op, written.errorMessage)
  return createResult(undefined)
}

import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { IDBPDatabase } from "idb"
import * as v from "valibot"
import type { SessionBoundedSnapshot } from "../api/sessionBoundedSnapshotSchema.js"
import { sessionBoundedSnapshotSchema } from "../api/sessionBoundedSnapshotSchema.js"
import {
  type SessionCacheHistoryEntryRecord,
  sessionCacheHistoryEntryRecordSchema,
} from "../schema/sessionCacheHistoryEntryRecordSchema.js"
import {
  type SessionCacheSnapshotRecord,
  sessionCacheSnapshotRecordSchema,
} from "../schema/sessionCacheSnapshotRecordSchema.js"
import { type SessionCacheLimits, sessionCacheDatabaseConfig } from "./sessionCacheDatabaseConfig.js"
import type { SessionCacheDatabaseSchema } from "./sessionCacheDatabaseSchema.js"
import { sessionCacheRecordByteSize } from "./sessionCacheRecordByteSize.js"
import { sessionCacheWrite } from "./sessionCacheWrite.js"

function sessionCacheSnapshotRecordCreate(
  userId: string,
  sessionId: string,
  snapshot: SessionBoundedSnapshot,
  storedAt: number,
): Result<SessionCacheSnapshotRecord> {
  const op = "sessionCacheSnapshotRecordCreate"
  const withoutSize = {
    entryIds: snapshot.semanticSteps.map((entry) => entry.id),
    payload: {
      detailCursor: snapshot.detailCursor,
      hasMore: snapshot.hasMore,
      latestAnswer: snapshot.latestAnswer,
      olderCursor: snapshot.olderCursor,
      session: snapshot.session,
      state: snapshot.state,
      throughPosition: snapshot.throughPosition,
    },
    schemaVersion: sessionCacheDatabaseConfig.recordSchemaVersion,
    sessionId,
    storedAt,
    userId,
  }
  const byteSize = sessionCacheRecordByteSize(withoutSize)
  if (!byteSize.success) return createResultError(op, byteSize.errorMessage)
  const parsed = v.safeParse(sessionCacheSnapshotRecordSchema, { ...withoutSize, byteSize: byteSize.data })
  if (!parsed.success) return createResultError(op, "The session cache snapshot record is invalid.")
  return createResult(parsed.output)
}

function sessionCacheSnapshotEntriesCreate(
  userId: string,
  sessionId: string,
  snapshot: SessionBoundedSnapshot,
  storedAt: number,
): Result<SessionCacheHistoryEntryRecord[]> {
  const op = "sessionCacheSnapshotEntriesCreate"
  const records: SessionCacheHistoryEntryRecord[] = []
  for (const entry of snapshot.semanticSteps) {
    const withoutSize = {
      entryId: entry.id,
      pageCursor: null,
      payload: entry,
      position: entry.sequence,
      schemaVersion: sessionCacheDatabaseConfig.recordSchemaVersion,
      sessionId,
      storedAt,
      throughPosition: snapshot.throughPosition,
      userId,
    }
    const byteSize = sessionCacheRecordByteSize(withoutSize)
    if (!byteSize.success) return createResultError(op, byteSize.errorMessage)
    const parsed = v.safeParse(sessionCacheHistoryEntryRecordSchema, { ...withoutSize, byteSize: byteSize.data })
    if (!parsed.success) return createResultError(op, "A session cache history entry is invalid.")
    records.push(parsed.output)
  }
  return createResult(records)
}

export async function sessionCacheSnapshotReplace(
  database: IDBPDatabase<SessionCacheDatabaseSchema>,
  input: {
    limits?: SessionCacheLimits
    snapshot: SessionBoundedSnapshot
    storedAt: number
    userId: string
  },
): Promise<Result<void>> {
  const op = "sessionCacheSnapshotReplace"
  const parsedSnapshot = v.safeParse(sessionBoundedSnapshotSchema, input.snapshot)
  if (!parsedSnapshot.success) return createResultError(op, "The bounded session snapshot is invalid.")
  const sessionId = parsedSnapshot.output.session.id
  const entryIds = parsedSnapshot.output.semanticSteps.map((entry) => entry.id)
  const positions = parsedSnapshot.output.semanticSteps.map((entry) => entry.sequence)
  if (new Set(entryIds).size !== entryIds.length || new Set(positions).size !== positions.length) {
    return createResultError(op, "The bounded session snapshot has duplicate projected entries.")
  }

  const snapshotRecord = sessionCacheSnapshotRecordCreate(
    input.userId,
    sessionId,
    parsedSnapshot.output,
    input.storedAt,
  )
  if (!snapshotRecord.success) return createResultError(op, snapshotRecord.errorMessage)
  const entryRecords = sessionCacheSnapshotEntriesCreate(input.userId, sessionId, parsedSnapshot.output, input.storedAt)
  if (!entryRecords.success) return createResultError(op, entryRecords.errorMessage)

  const limits = input.limits ?? sessionCacheDatabaseConfig.limits
  if (snapshotRecord.data.byteSize > limits.maxSnapshotBytes) {
    return createResultError(op, "The session cache snapshot exceeds its byte limit.")
  }
  if (entryRecords.data.some((record) => record.byteSize > limits.maxHistoryEntryBytes)) {
    return createResultError(op, "A session cache history entry exceeds its byte limit.")
  }
  if (entryRecords.data.length > limits.maxHistoryEntriesPerSession) {
    return createResultError(op, "The session cache snapshot exceeds its entry limit.")
  }

  const written = await sessionCacheWrite(
    database,
    { sessionId, userId: input.userId },
    async (transaction) => {
      const sessionKey = IDBKeyRange.only([input.userId, sessionId])
      const entries = transaction.objectStore("historyEntries")
      for (const key of await entries.index("by-session").getAllKeys(sessionKey)) await entries.delete(key)
      const pages = transaction.objectStore("historyPages")
      for (const key of await pages.index("by-session").getAllKeys(sessionKey)) await pages.delete(key)
      await transaction.objectStore("sessionSnapshots").put(snapshotRecord.data)
      for (const record of entryRecords.data) await entries.put(record)
    },
    limits,
  )
  if (!written.success) return createResultError(op, written.errorMessage)
  return createResult(undefined)
}

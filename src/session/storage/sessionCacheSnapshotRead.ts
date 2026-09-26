import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { IDBPDatabase, IDBPTransaction } from "idb"
import * as v from "valibot"
import type { SessionBoundedSnapshot } from "../api/sessionBoundedSnapshotSchema.js"
import { sessionBoundedSnapshotSchema } from "../api/sessionBoundedSnapshotSchema.js"
import { sessionCacheHistoryEntryRecordSchema } from "../schema/sessionCacheHistoryEntryRecordSchema.js"
import { sessionCacheSnapshotRecordSchema } from "../schema/sessionCacheSnapshotRecordSchema.js"
import type { SessionCacheDatabaseSchema } from "./sessionCacheDatabaseSchema.js"
import { sessionCacheRecordByteSize } from "./sessionCacheRecordByteSize.js"
import { sessionCacheStorageFailureDescribe } from "./sessionCacheStorageFailureDescribe.js"

type SessionCacheSnapshotReadTransaction = IDBPTransaction<
  SessionCacheDatabaseSchema,
  ["sessionSnapshots", "historyEntries", "historyPages"],
  "readwrite"
>

async function sessionCacheSnapshotCorruptDelete(
  transaction: SessionCacheSnapshotReadTransaction,
  key: { sessionId: string; userId: string },
) {
  await transaction.objectStore("sessionSnapshots").delete([key.userId, key.sessionId])
  const sessionKey = IDBKeyRange.only([key.userId, key.sessionId])
  for (const storeName of ["historyEntries", "historyPages"] as const) {
    const store = transaction.objectStore(storeName)
    for (const recordKey of await store.index("by-session").getAllKeys(sessionKey))
      await store.delete(recordKey as never)
  }
}

export async function sessionCacheSnapshotRead(
  database: IDBPDatabase<SessionCacheDatabaseSchema>,
  key: { sessionId: string; userId: string },
): Promise<Result<SessionBoundedSnapshot | undefined>> {
  const op = "sessionCacheSnapshotRead"
  let transaction: SessionCacheSnapshotReadTransaction | undefined
  try {
    transaction = database.transaction(["sessionSnapshots", "historyEntries", "historyPages"], "readwrite")
    const snapshotStore = transaction.objectStore("sessionSnapshots")
    const rawSnapshot = await snapshotStore.get([key.userId, key.sessionId])
    if (rawSnapshot === undefined) {
      await transaction.done
      return createResult(undefined)
    }

    const parsedSnapshot = v.safeParse(sessionCacheSnapshotRecordSchema, rawSnapshot)
    const snapshotSize = sessionCacheRecordByteSize(rawSnapshot)
    if (!parsedSnapshot.success || !snapshotSize.success || snapshotSize.data !== rawSnapshot.byteSize) {
      await sessionCacheSnapshotCorruptDelete(transaction, key)
      await transaction.done
      return createResultError(op, "The cached session snapshot is corrupt.")
    }

    const entries = []
    const entryStore = transaction.objectStore("historyEntries")
    for (const entryId of parsedSnapshot.output.entryIds) {
      const rawEntry = await entryStore.get([key.userId, key.sessionId, entryId])
      const parsedEntry = v.safeParse(sessionCacheHistoryEntryRecordSchema, rawEntry)
      const entrySize = rawEntry === undefined ? undefined : sessionCacheRecordByteSize(rawEntry)
      if (
        rawEntry === undefined ||
        !parsedEntry.success ||
        entrySize === undefined ||
        !entrySize.success ||
        entrySize.data !== rawEntry.byteSize ||
        parsedEntry.output.pageCursor !== null ||
        parsedEntry.output.throughPosition !== parsedSnapshot.output.payload.throughPosition
      ) {
        await sessionCacheSnapshotCorruptDelete(transaction, key)
        await transaction.done
        return createResultError(op, "The cached session snapshot is corrupt.")
      }
      entries.push(parsedEntry.output.payload)
    }

    const parsed = v.safeParse(sessionBoundedSnapshotSchema, {
      ...parsedSnapshot.output.payload,
      semanticSteps: entries.sort((first, second) => first.sequence - second.sequence),
    })
    if (!parsed.success) {
      await sessionCacheSnapshotCorruptDelete(transaction, key)
      await transaction.done
      return createResultError(op, "The cached session snapshot is corrupt.")
    }
    await transaction.done
    return createResult(parsed.output)
  } catch (error) {
    await transaction?.done.catch(() => undefined)
    const failure = sessionCacheStorageFailureDescribe(error)
    if (failure.kind === "schema") return createResultError(op, "The session cache database schema is invalid.")
    return createResultError(op, "The session cache database transaction failed.")
  }
}

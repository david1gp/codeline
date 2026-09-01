import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { IDBPDatabase, IDBPTransaction } from "idb"
import * as v from "valibot"
import type { SessionBoundedHistoryPage } from "../api/sessionBoundedHistoryPageSchema.js"
import { sessionBoundedHistoryPageSchema } from "../api/sessionBoundedHistoryPageSchema.js"
import { sessionOlderPageCursorSchema } from "../api/sessionOlderPageCursorSchema.js"
import { sessionCacheHistoryEntryRecordSchema } from "../schema/sessionCacheHistoryEntryRecordSchema.js"
import { sessionCacheHistoryPageRecordSchema } from "../schema/sessionCacheHistoryPageRecordSchema.js"
import type { SessionCacheDatabaseSchema } from "./sessionCacheDatabaseSchema.js"
import { sessionCacheRecordByteSize } from "./sessionCacheRecordByteSize.js"
import { sessionCacheStorageFailureDescribe } from "./sessionCacheStorageFailureDescribe.js"

type SessionCacheHistoryPageReadTransaction = IDBPTransaction<
  SessionCacheDatabaseSchema,
  ["sessionSnapshots", "historyEntries", "historyPages"],
  "readwrite"
>

async function sessionCacheHistoryPageCorruptDelete(
  transaction: SessionCacheHistoryPageReadTransaction,
  key: { requestCursor: string; sessionId: string; userId: string },
) {
  await transaction.objectStore("historyPages").delete([key.userId, key.sessionId, key.requestCursor])
  const entryStore = transaction.objectStore("historyEntries")
  const entries = await entryStore.index("by-session").getAll([key.userId, key.sessionId])
  for (const entry of entries) {
    if (entry.pageCursor === key.requestCursor) {
      await entryStore.delete([key.userId, key.sessionId, entry.entryId])
    }
  }
}

export async function sessionCacheHistoryPageRead(
  database: IDBPDatabase<SessionCacheDatabaseSchema>,
  key: { requestCursor: string; sessionId: string; userId: string },
): Promise<Result<SessionBoundedHistoryPage | undefined>> {
  const op = "sessionCacheHistoryPageRead"
  const parsedCursor = v.safeParse(sessionOlderPageCursorSchema, key.requestCursor)
  if (!parsedCursor.success) return createResultError(op, "The session cache history page key is invalid.")

  let transaction: SessionCacheHistoryPageReadTransaction | undefined
  try {
    transaction = database.transaction(["sessionSnapshots", "historyEntries", "historyPages"], "readwrite")
    const pageStore = transaction.objectStore("historyPages")
    const rawPage = await pageStore.get([key.userId, key.sessionId, parsedCursor.output])
    if (rawPage === undefined) {
      await transaction.done
      return createResult(undefined)
    }
    const parsedPage = v.safeParse(sessionCacheHistoryPageRecordSchema, rawPage)
    const pageSize = sessionCacheRecordByteSize(rawPage)
    const snapshot = await transaction.objectStore("sessionSnapshots").get([key.userId, key.sessionId])
    if (
      !parsedPage.success ||
      !pageSize.success ||
      pageSize.data !== rawPage.byteSize ||
      snapshot === undefined ||
      snapshot.payload.throughPosition !== rawPage.throughPosition
    ) {
      await sessionCacheHistoryPageCorruptDelete(transaction, key)
      await transaction.done
      return createResultError(op, "The cached session history page is corrupt.")
    }

    const entries = []
    const entryStore = transaction.objectStore("historyEntries")
    for (const entryId of parsedPage.output.entryIds) {
      const rawEntry = await entryStore.get([key.userId, key.sessionId, entryId])
      const parsedEntry = v.safeParse(sessionCacheHistoryEntryRecordSchema, rawEntry)
      const entrySize = rawEntry === undefined ? undefined : sessionCacheRecordByteSize(rawEntry)
      if (
        rawEntry === undefined ||
        !parsedEntry.success ||
        entrySize === undefined ||
        !entrySize.success ||
        entrySize.data !== rawEntry.byteSize ||
        parsedEntry.output.pageCursor !== parsedCursor.output ||
        parsedEntry.output.throughPosition !== parsedPage.output.throughPosition
      ) {
        await sessionCacheHistoryPageCorruptDelete(transaction, key)
        await transaction.done
        return createResultError(op, "The cached session history page is corrupt.")
      }
      entries.push(parsedEntry.output.payload)
    }

    const parsed = v.safeParse(sessionBoundedHistoryPageSchema, {
      hasMore: parsedPage.output.hasMore,
      nextCursor: parsedPage.output.nextCursor,
      semanticSteps: entries.sort((first, second) => first.sequence - second.sequence),
      throughPosition: parsedPage.output.throughPosition,
    })
    if (!parsed.success) {
      await sessionCacheHistoryPageCorruptDelete(transaction, key)
      await transaction.done
      return createResultError(op, "The cached session history page is corrupt.")
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

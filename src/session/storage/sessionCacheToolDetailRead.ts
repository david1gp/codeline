import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { IDBPDatabase } from "idb"
import * as v from "valibot"
import type { RunToolDetailResponse } from "../../run/api/runToolDetailResponseSchema.js"
import { sessionCacheToolDetailRecordSchema } from "../schema/sessionCacheToolDetailRecordSchema.js"
import type { SessionCacheDatabaseSchema } from "./sessionCacheDatabaseSchema.js"
import { sessionCacheRecordByteSize } from "./sessionCacheRecordByteSize.js"
import { sessionCacheStorageFailureDescribe } from "./sessionCacheStorageFailureDescribe.js"

export async function sessionCacheToolDetailRead(
  database: IDBPDatabase<SessionCacheDatabaseSchema>,
  key: { detailId: string; runId: string; sessionId: string; userId: string },
): Promise<Result<RunToolDetailResponse | undefined>> {
  const op = "sessionCacheToolDetailRead"
  try {
    const transaction = database.transaction("toolDetails", "readwrite")
    const rawRecord = await transaction.store.get([key.userId, key.sessionId, key.runId, key.detailId])
    if (rawRecord === undefined) {
      await transaction.done
      return createResult(undefined)
    }
    const parsed = v.safeParse(sessionCacheToolDetailRecordSchema, rawRecord)
    const byteSize = sessionCacheRecordByteSize(rawRecord)
    if (!parsed.success || !byteSize.success || byteSize.data !== rawRecord.byteSize) {
      await transaction.store.delete([key.userId, key.sessionId, key.runId, key.detailId])
      await transaction.done
      return createResultError(op, "The cached finalized tool detail is corrupt.")
    }
    await transaction.done
    return createResult(parsed.output.payload)
  } catch (error) {
    const failure = sessionCacheStorageFailureDescribe(error)
    if (failure.kind === "schema") return createResultError(op, "The session cache database schema is invalid.")
    return createResultError(op, "The session cache database transaction failed.")
  }
}

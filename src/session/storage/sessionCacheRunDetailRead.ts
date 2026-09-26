import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { IDBPDatabase } from "idb"
import * as v from "valibot"
import type { RunDetailResponse } from "../../run/api/runDetailResponseSchema.js"
import { sessionCacheRunDetailRecordSchema } from "../schema/sessionCacheRunDetailRecordSchema.js"
import type { SessionCacheDatabaseSchema } from "./sessionCacheDatabaseSchema.js"
import { sessionCacheRecordByteSize } from "./sessionCacheRecordByteSize.js"
import { sessionCacheStorageFailureDescribe } from "./sessionCacheStorageFailureDescribe.js"

export async function sessionCacheRunDetailRead(
  database: IDBPDatabase<SessionCacheDatabaseSchema>,
  key: { delegationId?: string; runId: string; sessionId: string; userId: string },
): Promise<Result<RunDetailResponse | undefined>> {
  const op = "sessionCacheRunDetailRead"
  try {
    const transaction = database.transaction("runDetails", "readwrite")
    const rawRecord = await transaction.store.get([key.userId, key.sessionId, key.runId])
    if (rawRecord === undefined) {
      await transaction.done
      return createResult(undefined)
    }
    const parsed = v.safeParse(sessionCacheRunDetailRecordSchema, rawRecord)
    const byteSize = sessionCacheRecordByteSize(rawRecord)
    if (!parsed.success || !byteSize.success || byteSize.data !== rawRecord.byteSize) {
      await transaction.store.delete([key.userId, key.sessionId, key.runId])
      await transaction.done
      return createResultError(op, "The cached finalized run detail is corrupt.")
    }
    if (
      (key.delegationId === undefined && parsed.output.delegationId !== undefined) ||
      (key.delegationId !== undefined && parsed.output.delegationId !== key.delegationId)
    ) {
      await transaction.done
      return createResult(undefined)
    }
    await transaction.done
    return createResult(parsed.output.payload)
  } catch (error) {
    const failure = sessionCacheStorageFailureDescribe(error)
    if (failure.kind === "schema") return createResultError(op, "The session cache database schema is invalid.")
    return createResultError(op, "The session cache database transaction failed.")
  }
}

import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { IDBPDatabase } from "idb"
import * as v from "valibot"
import type { RunToolDetailResponse } from "../../run/api/runToolDetailResponseSchema.js"
import { runToolDetailResponseSchema } from "../../run/api/runToolDetailResponseSchema.js"
import { sessionCacheToolDetailRecordSchema } from "../schema/sessionCacheToolDetailRecordSchema.js"
import { type SessionCacheLimits, sessionCacheDatabaseConfig } from "./sessionCacheDatabaseConfig.js"
import type { SessionCacheDatabaseSchema } from "./sessionCacheDatabaseSchema.js"
import { sessionCacheRecordByteSize } from "./sessionCacheRecordByteSize.js"
import { sessionCacheWrite } from "./sessionCacheWrite.js"

export async function sessionCacheToolDetailWrite(
  database: IDBPDatabase<SessionCacheDatabaseSchema>,
  input: {
    detail: RunToolDetailResponse
    detailId: string
    limits?: SessionCacheLimits
    runId: string
    sessionId: string
    storedAt: number
    userId: string
  },
): Promise<Result<void>> {
  const op = "sessionCacheToolDetailWrite"
  const parsedDetail = v.safeParse(runToolDetailResponseSchema, input.detail)
  if (!parsedDetail.success || parsedDetail.output.kind !== "finalized") {
    return createResultError(op, "Only finalized tool detail may be cached.")
  }
  const withoutSize = {
    detailId: input.detailId,
    payload: parsedDetail.output,
    runId: input.runId,
    schemaVersion: sessionCacheDatabaseConfig.recordSchemaVersion,
    sessionId: input.sessionId,
    storedAt: input.storedAt,
    userId: input.userId,
  }
  const byteSize = sessionCacheRecordByteSize(withoutSize)
  if (!byteSize.success) return createResultError(op, byteSize.errorMessage)
  const record = v.safeParse(sessionCacheToolDetailRecordSchema, { ...withoutSize, byteSize: byteSize.data })
  if (!record.success) return createResultError(op, "The finalized tool detail cache record is invalid.")

  const limits = input.limits ?? sessionCacheDatabaseConfig.limits
  if (record.output.byteSize > limits.maxDetailBytes) {
    return createResultError(op, "The finalized tool detail exceeds its byte limit.")
  }
  const written = await sessionCacheWrite(
    database,
    { sessionId: input.sessionId, userId: input.userId },
    async (transaction) => {
      const snapshot = await transaction.objectStore("sessionSnapshots").get([input.userId, input.sessionId])
      if (snapshot === undefined) throw new DOMException("A session snapshot is required.", "DataError")
      await transaction.objectStore("toolDetails").put(record.output)
    },
    limits,
  )
  if (!written.success) return createResultError(op, written.errorMessage)
  return createResult(undefined)
}

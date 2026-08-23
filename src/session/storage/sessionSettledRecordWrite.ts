import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { type IDBPDatabase, type IDBPTransaction } from "idb"
import * as v from "valibot"
import { type SessionSettledRecord, sessionSettledRecordSchema } from "../schema/sessionSettledRecordSchema.js"
import type { SessionSettledDatabaseSchema } from "./sessionSettledDatabaseSchema.js"
import { sessionSettledRecordIndex } from "./sessionSettledRecordIndex.js"
import { sessionSettledStorageFailureDescribe } from "./sessionSettledStorageFailureDescribe.js"

type SessionSettledRecordWriteAttempt =
  | { success: true }
  | { success: false; kind: "quota" | "schema" | "transaction" | "unknown" }

async function sessionSettledRecordWriteAttempt(
  database: IDBPDatabase<SessionSettledDatabaseSchema>,
  record: SessionSettledRecord,
  evictedSessionIds: readonly string[],
): Promise<SessionSettledRecordWriteAttempt> {
  let transaction: IDBPTransaction<SessionSettledDatabaseSchema, ["settledSessions"], "readwrite"> | undefined
  try {
    transaction = database.transaction("settledSessions", "readwrite")
    for (const sessionId of evictedSessionIds) await transaction.store.delete([record.userId, sessionId])
    await transaction.store.put(record)
    await transaction.done
    return { success: true }
  } catch (error) {
    await transaction?.done.catch(() => undefined)
    const failure = sessionSettledStorageFailureDescribe(error)
    return { kind: failure.kind, success: false }
  }
}

function sessionSettledRecordWriteFailureCreate(
  op: string,
  kind: "quota" | "schema" | "transaction" | "unknown",
): Result<void> {
  if (kind === "quota") return createResultError(op, "The settled-session storage quota was exceeded.")
  if (kind === "schema") return createResultError(op, "The settled-session database schema is invalid.")
  return createResultError(op, "The settled-session database transaction failed.")
}

export async function sessionSettledRecordWrite(
  database: IDBPDatabase<SessionSettledDatabaseSchema>,
  input: SessionSettledRecord,
): Promise<Result<void>> {
  const op = "sessionSettledRecordWrite"
  const parsedRecord = v.safeParse(sessionSettledRecordSchema, input)
  if (!parsedRecord.success) return createResultError(op, "The settled-session record is invalid.")

  const firstAttempt = await sessionSettledRecordWriteAttempt(database, parsedRecord.output, [])
  if (firstAttempt.success) return createResult(undefined)
  if (firstAttempt.kind !== "quota") return sessionSettledRecordWriteFailureCreate(op, firstAttempt.kind)

  const indexed = await sessionSettledRecordIndex(database, { userId: parsedRecord.output.userId })
  if (!indexed.success) return createResultError(op, indexed.errorMessage)

  const evictionCandidates = indexed.data
    .filter((record) => record.sessionId !== parsedRecord.output.sessionId)
    .sort((first, second) => {
      const sequenceOrder = first.asOfSequence - second.asOfSequence
      if (sequenceOrder !== 0) return sequenceOrder
      const updatedAtOrder = first.payload.session.updatedAt.localeCompare(second.payload.session.updatedAt)
      if (updatedAtOrder !== 0) return updatedAtOrder
      return first.sessionId.localeCompare(second.sessionId)
    })

  for (let count = 1; count <= evictionCandidates.length; count += 1) {
    const attempt = await sessionSettledRecordWriteAttempt(
      database,
      parsedRecord.output,
      evictionCandidates.slice(0, count).map((record) => record.sessionId),
    )
    if (attempt.success) return createResult(undefined)
    if (attempt.kind !== "quota") return sessionSettledRecordWriteFailureCreate(op, attempt.kind)
  }

  return createResultError(op, "The settled-session storage quota was exceeded.")
}

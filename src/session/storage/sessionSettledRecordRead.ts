import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { type IDBPDatabase } from "idb"
import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import { type SessionSettledRecord, sessionSettledRecordSchema } from "../schema/sessionSettledRecordSchema.js"
import type { SessionSettledDatabaseSchema } from "./sessionSettledDatabaseSchema.js"
import { sessionSettledStorageFailureDescribe } from "./sessionSettledStorageFailureDescribe.js"

const sessionSettledRecordKeySchema = v.strictObject({
  sessionId: apiPublicIdSchema,
  userId: apiPublicIdSchema,
})

export async function sessionSettledRecordRead(
  database: IDBPDatabase<SessionSettledDatabaseSchema>,
  input: { sessionId: string; userId: string },
): Promise<Result<SessionSettledRecord | undefined>> {
  const op = "sessionSettledRecordRead"
  const parsedInput = v.safeParse(sessionSettledRecordKeySchema, input)
  if (!parsedInput.success) return createResultError(op, "The settled-session record key is invalid.")

  try {
    const key: [string, string] = [parsedInput.output.userId, parsedInput.output.sessionId]
    const transaction = database.transaction("settledSessions", "readwrite")
    const record = await transaction.store.get(key)
    if (record === undefined) {
      await transaction.done
      return createResult(undefined)
    }

    const parsedRecord = v.safeParse(sessionSettledRecordSchema, record)
    if (parsedRecord.success) {
      await transaction.done
      return createResult(parsedRecord.output)
    }

    await transaction.store.delete(key)
    await transaction.done
    return createResultError(op, "The settled-session record was corrupt and has been deleted.")
  } catch (error) {
    const failure = sessionSettledStorageFailureDescribe(error)
    if (failure.kind === "quota") return createResultError(op, "The settled-session storage quota was exceeded.")
    if (failure.kind === "schema") return createResultError(op, "The settled-session database schema is invalid.")
    return createResultError(op, "The settled-session database transaction failed.")
  }
}

import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { type IDBPDatabase } from "idb"
import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import { type SessionSettledRecord, sessionSettledRecordSchema } from "../schema/sessionSettledRecordSchema.js"
import type { SessionSettledDatabaseSchema } from "./sessionSettledDatabaseSchema.js"
import { sessionSettledStorageFailureDescribe } from "./sessionSettledStorageFailureDescribe.js"

const sessionSettledRecordIndexInputSchema = v.strictObject({
  userId: apiPublicIdSchema,
})

export async function sessionSettledRecordIndex(
  database: IDBPDatabase<SessionSettledDatabaseSchema>,
  input: { userId: string },
): Promise<Result<readonly SessionSettledRecord[]>> {
  const op = "sessionSettledRecordIndex"
  const parsedInput = v.safeParse(sessionSettledRecordIndexInputSchema, input)
  if (!parsedInput.success) return createResultError(op, "The settled-session record user ID is invalid.")

  try {
    const transaction = database.transaction("settledSessions", "readwrite")
    const index = transaction.store.index("by-user")
    const records: SessionSettledRecord[] = []
    let cursor = await index.openCursor(parsedInput.output.userId)
    while (cursor !== null) {
      const parsedRecord = v.safeParse(sessionSettledRecordSchema, cursor.value)
      if (parsedRecord.success) {
        records.push(parsedRecord.output)
      } else {
        await cursor.delete()
      }
      cursor = await cursor.continue()
    }
    await transaction.done
    return createResult(records)
  } catch (error) {
    const failure = sessionSettledStorageFailureDescribe(error)
    if (failure.kind === "quota") return createResultError(op, "The settled-session storage quota was exceeded.")
    if (failure.kind === "schema") return createResultError(op, "The settled-session database schema is invalid.")
    return createResultError(op, "The settled-session database transaction failed.")
  }
}

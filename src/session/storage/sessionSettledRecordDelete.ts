import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { type IDBPDatabase } from "idb"
import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import type { SessionSettledDatabaseSchema } from "./sessionSettledDatabaseSchema.js"
import { sessionSettledStorageFailureDescribe } from "./sessionSettledStorageFailureDescribe.js"

const sessionSettledRecordKeySchema = v.strictObject({
  sessionId: apiPublicIdSchema,
  userId: apiPublicIdSchema,
})

export async function sessionSettledRecordDelete(
  database: IDBPDatabase<SessionSettledDatabaseSchema>,
  input: { sessionId: string; userId: string },
): Promise<Result<void>> {
  const op = "sessionSettledRecordDelete"
  const parsedInput = v.safeParse(sessionSettledRecordKeySchema, input)
  if (!parsedInput.success) return createResultError(op, "The settled-session record key is invalid.")

  try {
    const transaction = database.transaction("settledSessions", "readwrite")
    await transaction.store.delete([parsedInput.output.userId, parsedInput.output.sessionId])
    await transaction.done
    return createResult(undefined)
  } catch (error) {
    const failure = sessionSettledStorageFailureDescribe(error)
    if (failure.kind === "quota") return createResultError(op, "The settled-session storage quota was exceeded.")
    if (failure.kind === "schema") return createResultError(op, "The settled-session database schema is invalid.")
    return createResultError(op, "The settled-session database transaction failed.")
  }
}

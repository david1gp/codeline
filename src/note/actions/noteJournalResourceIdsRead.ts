import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { eq } from "drizzle-orm"
import type { DatabaseTransaction } from "../../database/databaseClient.js"
import { noteTable } from "../db/noteTable.js"

export async function noteJournalResourceIdsRead(
  transaction: DatabaseTransaction,
  userId: string,
): Promise<Result<readonly string[]>> {
  try {
    const notes = await transaction.select({ id: noteTable.id }).from(noteTable).where(eq(noteTable.userId, userId))
    return createResult(notes.map((note) => note.id))
  } catch (_error) {
    return createResultError("noteJournalResourceIdsRead", "The note journal resources could not be resolved.")
  }
}

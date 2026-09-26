import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { eq, sql } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { noteSortOrderRead } from "./noteSortOrderRead.js"
import { noteTable } from "./noteTable.js"

type NoteRow = typeof noteTable.$inferSelect

export async function noteRowsCompact(
  database: DatabaseExecutor,
  notes: readonly NoteRow[],
): Promise<Result<NoteRow[]>> {
  const op = "noteRowsCompact"
  const changed: NoteRow[] = []

  try {
    for (const [sortOrder, note] of notes.entries()) {
      if (noteSortOrderRead(note.sortOrder) === sortOrder) continue
      const [updated] = await database
        .update(noteTable)
        .set({ revision: sql`${noteTable.revision} + 1`, sortOrder })
        .where(eq(noteTable.id, note.id))
        .returning()
      if (updated === undefined) return createResultError(op, "The note could not be compacted.")
      changed.push(updated)
    }
    return createResult(changed)
  } catch (_error) {
    return createResultError(op, "The notes could not be compacted.")
  }
}

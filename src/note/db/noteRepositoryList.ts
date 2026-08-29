import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { eq } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import type { NoteListResponse } from "../api/noteListResponseSchema.js"
import { noteApiRecordCreate } from "./noteApiRecordCreate.js"
import { noteOrganizationAuthorize } from "./noteOrganizationAuthorize.js"
import { noteRowsOrder } from "./noteRowsOrder.js"
import { noteTable } from "./noteTable.js"

export async function noteRepositoryList(
  database: DatabaseExecutor,
  userId: string,
  organizationId?: string,
): Promise<Result<NoteListResponse>> {
  const op = "noteRepositoryList"
  const authorized = await noteOrganizationAuthorize(database, userId, organizationId)
  if (!authorized.success) return createResultError(op, authorized.errorMessage)

  try {
    const rows = await database.select().from(noteTable).where(eq(noteTable.userId, userId))
    const notes = []
    for (const row of noteRowsOrder(rows)) {
      const note = await noteApiRecordCreate(database, row)
      if (!note.success) return createResultError(op, note.errorMessage)
      notes.push(note.data)
    }
    return createResult(notes)
  } catch (_error) {
    return createResultError(op, "The notes could not be loaded.")
  }
}

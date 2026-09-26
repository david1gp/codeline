import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import type { NoteApiRecord } from "../api/noteApiRecordSchema.js"
import { noteApiRecordCreate } from "./noteApiRecordCreate.js"
import { noteOrganizationAuthorize } from "./noteOrganizationAuthorize.js"
import { noteTable } from "./noteTable.js"

export async function noteRepositoryLoad(
  database: DatabaseExecutor,
  userId: string,
  noteId: string,
  organizationId?: string,
): Promise<Result<NoteApiRecord | undefined>> {
  const op = "noteRepositoryLoad"
  const authorized = await noteOrganizationAuthorize(database, userId, organizationId)
  if (!authorized.success) return createResultError(op, authorized.errorMessage)

  try {
    const [row] = await database
      .select()
      .from(noteTable)
      .where(and(eq(noteTable.id, noteId), eq(noteTable.userId, userId)))
      .limit(1)
    if (row === undefined) return createResult(undefined)
    return await noteApiRecordCreate(database, row)
  } catch (_error) {
    return createResultError(op, "The note could not be loaded.")
  }
}

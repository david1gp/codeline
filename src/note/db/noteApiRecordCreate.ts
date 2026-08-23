import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { type NoteApiRecord, noteApiRecordSchema } from "../api/noteApiRecordSchema.js"
import type { noteTable } from "./noteTable.js"

type NoteRow = typeof noteTable.$inferSelect

export function noteApiRecordCreate(row: NoteRow): Result<NoteApiRecord> {
  const parsed = v.safeParse(noteApiRecordSchema, {
    content: row.content,
    createdAt: row.createdAt.getTime(),
    id: row.id,
    projectPath: row.projectPath,
    revision: row.revision,
    sortOrder: row.sortOrder,
    updatedAt: row.updatedAt.getTime(),
    userId: row.userId,
  })
  if (!parsed.success) return createResultError("noteApiRecordCreate", "The note response is invalid.")
  return createResult(parsed.output)
}

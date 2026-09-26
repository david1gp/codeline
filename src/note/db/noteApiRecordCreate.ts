import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { type NoteApiRecord, noteApiRecordSchema } from "../api/noteApiRecordSchema.js"
import { noteProjectIdResolve } from "./noteProjectIdResolve.js"
import type { noteTable } from "./noteTable.js"

type NoteRow = typeof noteTable.$inferSelect

export async function noteApiRecordCreate(database: DatabaseExecutor, row: NoteRow): Promise<Result<NoteApiRecord>> {
  const projectId = await noteProjectIdResolve(database, row.userId, row.projectPath)
  if (!projectId.success) return projectId
  const parsed = v.safeParse(noteApiRecordSchema, {
    content: row.content,
    createdAt: row.createdAt.getTime(),
    id: row.id,
    projectId: projectId.data,
    projectPath: row.projectPath,
    revision: row.revision,
    sortOrder: row.sortOrder,
    updatedAt: row.updatedAt.getTime(),
    userId: row.userId,
  })
  if (!parsed.success) return createResultError("noteApiRecordCreate", "The note response is invalid.")
  return createResult(parsed.output)
}

import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { type NoteApiRecord, noteApiRecordSchema } from "../api/noteApiRecordSchema.js"
import { noteProjectIdResolve } from "./noteProjectIdResolve.js"

export async function noteApiRecordReplayCreate(
  database: DatabaseExecutor,
  userId: string,
  responseBody: unknown,
): Promise<Result<NoteApiRecord>> {
  const op = "noteApiRecordReplayCreate"
  const hasProjectId = typeof responseBody === "object" && responseBody !== null && "projectId" in responseBody
  const parsed = v.safeParse(noteApiRecordSchema, {
    projectId: null,
    ...(typeof responseBody === "object" && responseBody !== null ? responseBody : {}),
  })
  if (!parsed.success) return createResultError(op, "The stored idempotency response is invalid.")
  if (hasProjectId) return createResult(parsed.output)

  const projectId = await noteProjectIdResolve(database, userId, parsed.output.projectPath)
  if (!projectId.success) return createResultError(op, projectId.errorMessage)
  const current = v.safeParse(noteApiRecordSchema, { ...parsed.output, projectId: projectId.data })
  if (!current.success) return createResultError(op, "The stored idempotency response is invalid.")
  return createResult(current.output)
}

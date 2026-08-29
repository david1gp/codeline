import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq, sql } from "drizzle-orm"
import { mutationIdempotencyTable } from "../../api/db/mutationIdempotencyTable.js"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { noteRepresentationEtagCreate } from "../api/noteRepresentationEtagCreate.js"
import type { NoteReorderRequest } from "../schema/noteReorderRequestSchema.js"
import { noteApiRecordCreate } from "./noteApiRecordCreate.js"
import { noteApiRecordReplayCreate } from "./noteApiRecordReplayCreate.js"
import { noteOrganizationAuthorize } from "./noteOrganizationAuthorize.js"
import { notePreconditionConflictCreate } from "./notePreconditionConflictCreate.js"
import { noteProjectPathNormalize } from "./noteProjectPathNormalize.js"
import { noteRepositoryIdempotencyConflictCreate } from "./noteRepositoryIdempotencyConflictCreate.js"
import type { NoteRepositoryMutationResult } from "./noteRepositoryMutationResult.js"
import { noteRowsCompact } from "./noteRowsCompact.js"
import { noteRowsOrder } from "./noteRowsOrder.js"
import { noteTable } from "./noteTable.js"

const noteReorderOperation = "note.reorder"
type NoteRepositoryReorderInput = Omit<NoteReorderRequest, "projectId"> & { projectPath: string | null }

export async function noteRepositoryReorder(
  database: DatabaseExecutor,
  userId: string,
  noteId: string,
  input: NoteRepositoryReorderInput & {
    expectedEtag?: string
    organizationId?: string
    requestHash?: string
    requireIfMatch?: boolean
  },
): Promise<Result<NoteRepositoryMutationResult>> {
  const op = "noteRepositoryReorder"
  const authorized = await noteOrganizationAuthorize(database, userId, input.organizationId)
  if (!authorized.success) return createResultError(op, authorized.errorMessage)

  try {
    if (input.id !== undefined && input.id !== noteId) return createResultError(op, "The note id is invalid.")
    const replayed = await noteReorderIdempotencyLoad(database, userId, noteId, input)
    if (!replayed.success) return createResultError(op, replayed.errorMessage)
    if (replayed.data !== undefined) return createResult(replayed.data)

    const [existing] = await database
      .select()
      .from(noteTable)
      .where(and(eq(noteTable.id, noteId), eq(noteTable.userId, userId)))
      .limit(1)
    if (existing === undefined) return createResultError(op, "The note could not be found.")
    if (noteProjectPathNormalize(existing.projectPath) !== input.projectPath)
      return createResultError(op, "The note does not belong to the requested project.")
    if (
      (input.requireIfMatch === true || input.expectedEtag !== undefined) &&
      (input.expectedEtag === undefined ||
        input.expectedEtag !== noteRepresentationEtagCreate(existing.id, existing.revision))
    )
      return notePreconditionConflictCreate(op, "The note changed before it could be reordered.", existing)

    const rows = await database.select().from(noteTable).where(eq(noteTable.userId, userId))
    const projectNotes = noteRowsOrder(rows, input.projectPath)
    const currentIndex = projectNotes.findIndex((note) => note.id === existing.id)
    const compacted = await noteRowsCompact(database, projectNotes)
    if (!compacted.success) return createResultError(op, compacted.errorMessage)
    const affected: Array<{ id: string; revision: number }> = compacted.data.map((note) => ({
      id: note.id,
      revision: note.revision,
    }))

    const adjacentIndex = currentIndex + (input.direction === "up" ? -1 : 1)
    const adjacent = projectNotes[adjacentIndex]
    if (currentIndex < 0 || adjacent === undefined) {
      const [current] = await database
        .select()
        .from(noteTable)
        .where(and(eq(noteTable.id, noteId), eq(noteTable.userId, userId)))
        .limit(1)
      if (current === undefined) return createResultError(op, "The note could not be found.")
      const response = await noteApiRecordCreate(database, current)
      if (!response.success) return createResultError(op, response.errorMessage)
      const stored = await noteReorderIdempotencyStore(database, userId, noteId, input, response.data)
      if (!stored.success) return createResultError(op, stored.errorMessage)
      return createResult({ affectedNotes: uniqueAffected(affected), replayed: false, responseBody: response.data })
    }

    const [updatedAdjacent] = await database
      .update(noteTable)
      .set({ revision: sql`${noteTable.revision} + 1`, sortOrder: currentIndex })
      .where(and(eq(noteTable.id, adjacent.id), eq(noteTable.userId, userId)))
      .returning()
    const [updatedExisting] = await database
      .update(noteTable)
      .set({ revision: sql`${noteTable.revision} + 1`, sortOrder: adjacentIndex })
      .where(and(eq(noteTable.id, existing.id), eq(noteTable.userId, userId)))
      .returning()
    if (updatedAdjacent === undefined || updatedExisting === undefined)
      return createResultError(op, "The note could not be reordered.")
    affected.push(
      { id: updatedAdjacent.id, revision: updatedAdjacent.revision },
      { id: updatedExisting.id, revision: updatedExisting.revision },
    )
    const response = await noteApiRecordCreate(database, updatedExisting)
    if (!response.success) return createResultError(op, response.errorMessage)
    const stored = await noteReorderIdempotencyStore(database, userId, noteId, input, response.data)
    if (!stored.success) return createResultError(op, stored.errorMessage)
    return createResult({ affectedNotes: uniqueAffected(affected), replayed: false, responseBody: response.data })
  } catch (_error) {
    return createResultError(op, "The note could not be reordered.")
  }
}

function uniqueAffected(affected: Array<{ id: string; revision: number }>): Array<{ id: string; revision: number }> {
  const byId = new Map<string, number>()
  for (const item of affected) byId.set(item.id, item.revision)
  return [...byId].map(([id, revision]) => ({ id, revision }))
}

async function noteReorderIdempotencyLoad(
  database: DatabaseExecutor,
  userId: string,
  noteId: string,
  input: { idempotencyKey?: string; requestHash?: string },
): Promise<Result<NoteRepositoryMutationResult | undefined>> {
  const op = "noteRepositoryReorder"
  if (input.idempotencyKey === undefined) return createResult(undefined)
  if (input.requestHash === undefined) return createResultError(op, "The idempotency request hash is required.")
  const [idempotent] = await database
    .select()
    .from(mutationIdempotencyTable)
    .where(
      and(
        eq(mutationIdempotencyTable.userId, userId),
        eq(mutationIdempotencyTable.operation, noteReorderOperation),
        eq(mutationIdempotencyTable.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1)
  if (idempotent === undefined) return createResult(undefined)
  if (idempotent.resourceId !== noteId || idempotent.requestHash !== input.requestHash)
    return noteRepositoryIdempotencyConflictCreate(op)
  const response = await noteApiRecordReplayCreate(database, userId, idempotent.responseBody)
  if (!response.success) return createResultError(op, response.errorMessage)
  return createResult({ affectedNotes: [], replayed: true, responseBody: response.data })
}

async function noteReorderIdempotencyStore(
  database: DatabaseExecutor,
  userId: string,
  noteId: string,
  input: { idempotencyKey?: string; requestHash?: string },
  response: NonNullable<NoteRepositoryMutationResult["responseBody"]>,
): Promise<Result<void>> {
  const op = "noteRepositoryReorder"
  if (input.idempotencyKey === undefined) return createResult(undefined)
  if (input.requestHash === undefined) return createResultError(op, "The idempotency request hash is required.")
  const inserted = await database
    .insert(mutationIdempotencyTable)
    .values({
      createdAt: new Date(),
      id: uuidv7(),
      idempotencyKey: input.idempotencyKey,
      operation: noteReorderOperation,
      requestHash: input.requestHash,
      resourceId: noteId,
      responseBody: response,
      status: 200,
      userId,
    })
    .onConflictDoNothing({
      target: [
        mutationIdempotencyTable.userId,
        mutationIdempotencyTable.operation,
        mutationIdempotencyTable.idempotencyKey,
      ],
    })
    .returning({ id: mutationIdempotencyTable.id })
  if (inserted.length === 0) return noteRepositoryIdempotencyConflictCreate(op)
  return createResult(undefined)
}

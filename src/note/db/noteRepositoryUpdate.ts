import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq, sql } from "drizzle-orm"
import * as v from "valibot"
import { mutationIdempotencyTable } from "../../api/db/mutationIdempotencyTable.js"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { noteApiRecordSchema } from "../api/noteApiRecordSchema.js"
import { noteRepresentationEtagCreate } from "../api/noteRepresentationEtagCreate.js"
import type { NoteUpdateRequest } from "../schema/noteUpdateRequestSchema.js"
import { noteApiRecordCreate } from "./noteApiRecordCreate.js"
import { noteOrganizationAuthorize } from "./noteOrganizationAuthorize.js"
import { notePreconditionConflictCreate } from "./notePreconditionConflictCreate.js"
import { noteProjectPathNormalize } from "./noteProjectPathNormalize.js"
import { noteRepositoryIdempotencyConflictCreate } from "./noteRepositoryIdempotencyConflictCreate.js"
import type { NoteRepositoryMutationResult } from "./noteRepositoryMutationResult.js"
import { noteRowsCompact } from "./noteRowsCompact.js"
import { noteRowsOrder } from "./noteRowsOrder.js"
import { noteTable } from "./noteTable.js"

const noteUpdateOperation = "note.update"

export async function noteRepositoryUpdate(
  database: DatabaseExecutor,
  userId: string,
  noteId: string,
  input: NoteUpdateRequest & {
    expectedEtag?: string
    organizationId?: string
    requestHash?: string
    requireIfMatch?: boolean
  },
): Promise<Result<NoteRepositoryMutationResult>> {
  const op = "noteRepositoryUpdate"
  const authorized = await noteOrganizationAuthorize(database, userId, input.organizationId)
  if (!authorized.success) return createResultError(op, authorized.errorMessage)

  try {
    if (input.id !== undefined && input.id !== noteId) return createResultError(op, "The note id is invalid.")
    const replayed = await noteUpdateIdempotencyLoad(database, userId, noteId, input)
    if (!replayed.success) return createResultError(op, replayed.errorMessage)
    if (replayed.data !== undefined) return createResult(replayed.data)

    const [existing] = await database
      .select()
      .from(noteTable)
      .where(and(eq(noteTable.id, noteId), eq(noteTable.userId, userId)))
      .limit(1)
    if (existing === undefined) return createResultError(op, "The note could not be found.")

    if (
      (input.requireIfMatch === true || input.expectedEtag !== undefined) &&
      (input.expectedEtag === undefined ||
        input.expectedEtag !== noteRepresentationEtagCreate(existing.id, existing.revision))
    )
      return notePreconditionConflictCreate(op, "The note changed before it could be updated.", existing)

    const rows = await database.select().from(noteTable).where(eq(noteTable.userId, userId))
    const currentProjectPath = noteProjectPathNormalize(existing.projectPath)
    const destinationProjectPath = input.projectPath
    const affected: Array<{ id: string; revision: number }> = []

    if (currentProjectPath === destinationProjectPath) {
      const projectNotes = noteRowsOrder(rows, currentProjectPath)
      const currentIndex = projectNotes.findIndex((note) => note.id === existing.id)
      const compacted = await noteRowsCompact(database, projectNotes)
      if (!compacted.success) return createResultError(op, compacted.errorMessage)
      affected.push(...compacted.data.map((note) => ({ id: note.id, revision: note.revision })))

      const [updated] = await database
        .update(noteTable)
        .set({
          content: input.content,
          projectPath: destinationProjectPath,
          revision: sql`${noteTable.revision} + 1`,
          sortOrder: currentIndex,
          updatedAt: new Date(input.updatedAt),
        })
        .where(and(eq(noteTable.id, noteId), eq(noteTable.userId, userId)))
        .returning()
      if (updated === undefined) return createResultError(op, "The note could not be updated.")
      affected.push({ id: updated.id, revision: updated.revision })
      return noteUpdateComplete(database, userId, noteId, input, affected, updated, false)
    }

    const sourceNotes = noteRowsOrder(rows, currentProjectPath).filter((note) => note.id !== existing.id)
    const destinationNotes = noteRowsOrder(rows, destinationProjectPath).filter((note) => note.id !== existing.id)
    const sourceCompacted = await noteRowsCompact(database, sourceNotes)
    if (!sourceCompacted.success) return createResultError(op, sourceCompacted.errorMessage)
    const destinationCompacted = await noteRowsCompact(database, destinationNotes)
    if (!destinationCompacted.success) return createResultError(op, destinationCompacted.errorMessage)
    affected.push(...sourceCompacted.data.map((note) => ({ id: note.id, revision: note.revision })))
    affected.push(...destinationCompacted.data.map((note) => ({ id: note.id, revision: note.revision })))

    const [updated] = await database
      .update(noteTable)
      .set({
        content: input.content,
        projectPath: destinationProjectPath,
        revision: sql`${noteTable.revision} + 1`,
        sortOrder: destinationNotes.length,
        updatedAt: new Date(input.updatedAt),
      })
      .where(and(eq(noteTable.id, noteId), eq(noteTable.userId, userId)))
      .returning()
    if (updated === undefined) return createResultError(op, "The note could not be updated.")
    affected.push({ id: updated.id, revision: updated.revision })
    return noteUpdateComplete(database, userId, noteId, input, affected, updated, false)
  } catch (_error) {
    return createResultError(op, "The note could not be updated.")
  }
}

async function noteUpdateComplete(
  database: DatabaseExecutor,
  userId: string,
  noteId: string,
  input: { idempotencyKey?: string; requestHash?: string },
  affectedNotes: Array<{ id: string; revision: number }>,
  updated: typeof noteTable.$inferSelect,
  replayed: boolean,
): Promise<Result<NoteRepositoryMutationResult>> {
  const response = noteApiRecordCreate(updated)
  if (!response.success) return createResultError("noteRepositoryUpdate", response.errorMessage)
  const stored = await noteUpdateIdempotencyStore(database, userId, noteId, input, response.data)
  if (!stored.success) return createResultError("noteRepositoryUpdate", stored.errorMessage)
  return createResult({ affectedNotes, replayed, responseBody: response.data })
}

async function noteUpdateIdempotencyLoad(
  database: DatabaseExecutor,
  userId: string,
  noteId: string,
  input: { idempotencyKey?: string; requestHash?: string },
): Promise<Result<NoteRepositoryMutationResult | undefined>> {
  const op = "noteRepositoryUpdate"
  if (input.idempotencyKey === undefined) return createResult(undefined)
  if (input.requestHash === undefined) return createResultError(op, "The idempotency request hash is required.")
  const [idempotent] = await database
    .select()
    .from(mutationIdempotencyTable)
    .where(
      and(
        eq(mutationIdempotencyTable.userId, userId),
        eq(mutationIdempotencyTable.operation, noteUpdateOperation),
        eq(mutationIdempotencyTable.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1)
  if (idempotent === undefined) return createResult(undefined)
  if (idempotent.resourceId !== noteId || idempotent.requestHash !== input.requestHash)
    return noteRepositoryIdempotencyConflictCreate(op)
  const response = v.safeParse(noteApiRecordSchema, idempotent.responseBody)
  if (!response.success) return createResultError(op, "The stored idempotency response is invalid.")
  return createResult({ affectedNotes: [], replayed: true, responseBody: response.output })
}

async function noteUpdateIdempotencyStore(
  database: DatabaseExecutor,
  userId: string,
  noteId: string,
  input: { idempotencyKey?: string; requestHash?: string },
  response: NonNullable<NoteRepositoryMutationResult["responseBody"]>,
): Promise<Result<void>> {
  const op = "noteRepositoryUpdate"
  if (input.idempotencyKey === undefined) return createResult(undefined)
  if (input.requestHash === undefined) return createResultError(op, "The idempotency request hash is required.")
  const inserted = await database
    .insert(mutationIdempotencyTable)
    .values({
      createdAt: new Date(),
      id: uuidv7(),
      idempotencyKey: input.idempotencyKey,
      operation: noteUpdateOperation,
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

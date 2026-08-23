import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import * as v from "valibot"
import { mutationIdempotencyTable } from "../../api/db/mutationIdempotencyTable.js"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { noteApiRecordSchema } from "../api/noteApiRecordSchema.js"
import { noteRepresentationEtagCreate } from "../api/noteRepresentationEtagCreate.js"
import { noteApiRecordCreate } from "./noteApiRecordCreate.js"
import { noteOrganizationAuthorize } from "./noteOrganizationAuthorize.js"
import { notePreconditionConflictCreate } from "./notePreconditionConflictCreate.js"
import { noteRepositoryIdempotencyConflictCreate } from "./noteRepositoryIdempotencyConflictCreate.js"
import type { NoteRepositoryMutationResult } from "./noteRepositoryMutationResult.js"
import { noteRowsCompact } from "./noteRowsCompact.js"
import { noteRowsOrder } from "./noteRowsOrder.js"
import { noteProjectPathNormalize } from "./noteProjectPathNormalize.js"
import { noteTable } from "./noteTable.js"

const noteDeleteOperation = "note.delete"

export async function noteRepositoryDelete(
  database: DatabaseExecutor,
  userId: string,
  noteId: string,
  options: {
    expectedEtag?: string
    idempotencyKey?: string
    organizationId?: string
    requestHash?: string
    requireIfMatch?: boolean
  } = {},
): Promise<Result<NoteRepositoryMutationResult>> {
  const op = "noteRepositoryDelete"
  const authorized = await noteOrganizationAuthorize(database, userId, options.organizationId)
  if (!authorized.success) return createResultError(op, authorized.errorMessage)

  try {
    const replayed = await noteDeleteIdempotencyLoad(database, userId, noteId, options)
    if (!replayed.success) return createResultError(op, replayed.errorMessage)
    if (replayed.data !== undefined) return createResult(replayed.data)

    const [existing] = await database
      .select()
      .from(noteTable)
      .where(and(eq(noteTable.id, noteId), eq(noteTable.userId, userId)))
      .limit(1)
    if (existing === undefined) return createResultError(op, "The note could not be found.")

    if (
      (options.requireIfMatch === true || options.expectedEtag !== undefined) &&
      (options.expectedEtag === undefined ||
        options.expectedEtag !== noteRepresentationEtagCreate(existing.id, existing.revision))
    )
      return notePreconditionConflictCreate(op, "The note changed before it could be deleted.", existing)

    const rows = await database.select().from(noteTable).where(eq(noteTable.userId, userId))
    const remaining = noteRowsOrder(rows, noteProjectPathNormalize(existing.projectPath)).filter(
      (note) => note.id !== existing.id,
    )
    const compacted = await noteRowsCompact(database, remaining)
    if (!compacted.success) return createResultError(op, compacted.errorMessage)

    const [deleted] = await database
      .delete(noteTable)
      .where(and(eq(noteTable.id, noteId), eq(noteTable.userId, userId)))
      .returning()
    if (deleted === undefined) return createResultError(op, "The note could not be found.")

    const response = noteApiRecordCreate({ ...deleted, revision: deleted.revision + 1 })
    if (!response.success) return createResultError(op, response.errorMessage)
    const stored = await noteDeleteIdempotencyStore(database, userId, noteId, options, response.data)
    if (!stored.success) return createResultError(op, stored.errorMessage)

    return createResult({
      affectedNotes: [
        { id: deleted.id, revision: deleted.revision + 1 },
        ...compacted.data.map((note) => ({ id: note.id, revision: note.revision })),
      ],
      deleted: true,
      replayed: false,
      responseBody: response.data,
    })
  } catch (_error) {
    return createResultError(op, "The note could not be deleted.")
  }
}

async function noteDeleteIdempotencyLoad(
  database: DatabaseExecutor,
  userId: string,
  noteId: string,
  options: { idempotencyKey?: string; requestHash?: string },
): Promise<Result<NoteRepositoryMutationResult | undefined>> {
  const op = "noteRepositoryDelete"
  if (options.idempotencyKey === undefined) return createResult(undefined)
  if (options.requestHash === undefined) return createResultError(op, "The idempotency request hash is required.")
  const [idempotent] = await database
    .select()
    .from(mutationIdempotencyTable)
    .where(
      and(
        eq(mutationIdempotencyTable.userId, userId),
        eq(mutationIdempotencyTable.operation, noteDeleteOperation),
        eq(mutationIdempotencyTable.idempotencyKey, options.idempotencyKey),
      ),
    )
    .limit(1)
  if (idempotent === undefined) return createResult(undefined)
  if (idempotent.resourceId !== noteId || idempotent.requestHash !== options.requestHash)
    return noteRepositoryIdempotencyConflictCreate(op)
  const response = v.safeParse(noteApiRecordSchema, idempotent.responseBody)
  if (!response.success) return createResultError(op, "The stored idempotency response is invalid.")
  return createResult({ affectedNotes: [], deleted: true, replayed: true, responseBody: response.output })
}

async function noteDeleteIdempotencyStore(
  database: DatabaseExecutor,
  userId: string,
  noteId: string,
  options: { idempotencyKey?: string; requestHash?: string },
  response: NonNullable<NoteRepositoryMutationResult["responseBody"]>,
): Promise<Result<void>> {
  const op = "noteRepositoryDelete"
  if (options.idempotencyKey === undefined) return createResult(undefined)
  if (options.requestHash === undefined) return createResultError(op, "The idempotency request hash is required.")
  const inserted = await database
    .insert(mutationIdempotencyTable)
    .values({
      createdAt: new Date(),
      id: uuidv7(),
      idempotencyKey: options.idempotencyKey,
      operation: noteDeleteOperation,
      requestHash: options.requestHash,
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

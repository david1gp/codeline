import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import { mutationIdempotencyTable } from "../../api/db/mutationIdempotencyTable.js"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import type { NoteCreateRequest } from "../schema/noteCreateRequestSchema.js"
import { noteApiRecordCreate } from "./noteApiRecordCreate.js"
import { noteApiRecordReplayCreate } from "./noteApiRecordReplayCreate.js"
import { noteOrganizationAuthorize } from "./noteOrganizationAuthorize.js"
import { noteRepositoryIdempotencyConflictCreate } from "./noteRepositoryIdempotencyConflictCreate.js"
import type { NoteRepositoryMutationResult } from "./noteRepositoryMutationResult.js"
import { noteRowsCompact } from "./noteRowsCompact.js"
import { noteRowsOrder } from "./noteRowsOrder.js"
import { noteTable } from "./noteTable.js"

const noteCreateOperation = "note.create"
type NoteRepositoryCreateInput = Omit<NoteCreateRequest, "projectId"> & { projectPath: string | null }

export async function noteRepositoryCreate(
  database: DatabaseExecutor,
  userId: string,
  input: NoteRepositoryCreateInput & { organizationId?: string; requestHash?: string },
): Promise<Result<NoteRepositoryMutationResult>> {
  const op = "noteRepositoryCreate"
  const authorized = await noteOrganizationAuthorize(database, userId, input.organizationId)
  if (!authorized.success) return createResultError(op, authorized.errorMessage)

  try {
    if (input.idempotencyKey !== undefined && input.requestHash === undefined)
      return createResultError(op, "The idempotency request hash is required.")

    if (input.idempotencyKey !== undefined) {
      const replayed = await noteCreateIdempotencyLoad(database, userId, input)
      if (!replayed.success) return createResultError(op, replayed.errorMessage)
      if (replayed.data !== undefined) return createResult(replayed.data)
    }

    const [existing] = await database
      .select()
      .from(noteTable)
      .where(and(eq(noteTable.id, input.id), eq(noteTable.userId, userId)))
      .limit(1)
    if (existing !== undefined) return createResultError(op, "The note already exists.")

    const rows = await database.select().from(noteTable).where(eq(noteTable.userId, userId))
    const projectNotes = noteRowsOrder(rows, input.projectPath)
    const compacted = await noteRowsCompact(database, projectNotes)
    if (!compacted.success) return createResultError(op, compacted.errorMessage)

    const [created] = await database
      .insert(noteTable)
      .values({
        content: input.content,
        createdAt: new Date(input.createdAt),
        id: input.id,
        projectPath: input.projectPath,
        revision: 1,
        sortOrder: projectNotes.length,
        updatedAt: new Date(input.updatedAt),
        userId,
      })
      .returning()
    if (created === undefined) return createResultError(op, "The note could not be created.")

    const response = await noteApiRecordCreate(database, created)
    if (!response.success) return createResultError(op, response.errorMessage)
    const stored = await noteCreateIdempotencyStore(database, userId, input, response.data)
    if (!stored.success) return createResultError(op, stored.errorMessage)

    return createResult({
      affectedNotes: [
        ...compacted.data.map((note) => ({ id: note.id, revision: note.revision })),
        { id: created.id, revision: created.revision },
      ],
      created: true,
      replayed: false,
      responseBody: response.data,
    })
  } catch (_error) {
    return createResultError(op, "The note could not be created.")
  }
}

async function noteCreateIdempotencyLoad(
  database: DatabaseExecutor,
  userId: string,
  input: { idempotencyKey?: string; requestHash?: string },
): Promise<Result<NoteRepositoryMutationResult | undefined>> {
  const op = "noteRepositoryCreate"
  if (input.idempotencyKey === undefined) return createResult(undefined)
  if (input.requestHash === undefined) return createResultError(op, "The idempotency request hash is required.")

  const [idempotent] = await database
    .select()
    .from(mutationIdempotencyTable)
    .where(
      and(
        eq(mutationIdempotencyTable.userId, userId),
        eq(mutationIdempotencyTable.operation, noteCreateOperation),
        eq(mutationIdempotencyTable.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1)
  if (idempotent === undefined) return createResult(undefined)
  if (idempotent.requestHash !== input.requestHash) return noteRepositoryIdempotencyConflictCreate(op)

  const response = await noteApiRecordReplayCreate(database, userId, idempotent.responseBody)
  if (!response.success) return createResultError(op, response.errorMessage)
  return createResult({
    affectedNotes: [],
    created: false,
    replayed: true,
    responseBody: response.data,
  })
}

async function noteCreateIdempotencyStore(
  database: DatabaseExecutor,
  userId: string,
  input: { id?: string; idempotencyKey?: string; requestHash?: string },
  response: NoteRepositoryMutationResult["responseBody"],
): Promise<Result<void>> {
  const op = "noteRepositoryCreate"
  if (input.idempotencyKey === undefined) return createResult(undefined)
  if (input.requestHash === undefined) return createResultError(op, "The idempotency request hash is required.")
  if (response === undefined) return createResultError(op, "The note response is missing.")

  const inserted = await database
    .insert(mutationIdempotencyTable)
    .values({
      createdAt: new Date(),
      id: uuidv7(),
      idempotencyKey: input.idempotencyKey,
      operation: noteCreateOperation,
      requestHash: input.requestHash,
      resourceId: input.id ?? response.id,
      responseBody: response,
      status: 201,
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

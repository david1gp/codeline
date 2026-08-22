import { createResult, createResultError, createResultErrorCode, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import * as v from "valibot"
import { mutationIdempotencyTable } from "../../api/db/mutationIdempotencyTable.js"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { messageCopyFinalizedPrefix } from "../../message/actions/messageCopyFinalizedPrefix.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import {
  type SessionCreateMutationResponse,
  sessionCreateMutationResponseSchema,
} from "../api/sessionCreateMutationResponseSchema.js"
import { sessionCreateMutationResponseCreate } from "../api/sessionCreateMutationResponseCreate.js"
import { sessionTable } from "./sessionTable.js"

const sessionBranchOperation = "session.branch"

type SessionBranchMutationResult = {
  created: boolean
  replayed: boolean
  responseBody?: SessionCreateMutationResponse
  session: typeof sessionTable.$inferSelect
}

export async function sessionRepositoryBranch(
  database: DatabaseExecutor,
  userId: string,
  organizationId: string,
  sourceSessionId: string,
  input: {
    clientRequestId: string
    id?: string
    idempotencyKey?: string
    messageId: string
    requestHash?: string
  },
): Promise<Result<SessionBranchMutationResult>> {
  const op = "sessionRepositoryBranch"

  try {
    const [source] = await database
      .select({ session: sessionTable })
      .from(sessionTable)
      .innerJoin(
        serverTable,
        and(eq(sessionTable.serverId, serverTable.id), eq(serverTable.organizationId, organizationId)),
      )
      .where(and(eq(sessionTable.id, sourceSessionId), eq(sessionTable.userId, userId)))
      .for("update")
      .limit(1)
    if (source === undefined) return createResultError(op, "The session could not be found.")
    if (input.idempotencyKey !== undefined && input.requestHash === undefined)
      return createResultError(op, "The idempotency request hash is required.")

    if (input.idempotencyKey !== undefined) {
      const replayed = await sessionBranchIdempotencyLoad(database, userId, organizationId, input)
      if (!replayed.success) return replayed
      if (replayed.data !== undefined) return createResult(replayed.data)
    }
    if (source.session.archivedAt !== null) return createResultError(op, "The session is archived.")

    const [existing] = await database
      .select({ session: sessionTable })
      .from(sessionTable)
      .innerJoin(
        serverTable,
        and(eq(sessionTable.serverId, serverTable.id), eq(serverTable.organizationId, organizationId)),
      )
      .where(and(eq(sessionTable.userId, userId), eq(sessionTable.clientRequestId, input.clientRequestId)))
      .for("update")
      .limit(1)
    if (existing !== undefined) {
      const response = sessionCreateMutationResponseCreate({ created: false, session: existing.session })
      if (!response.success) return response
      const stored = await sessionBranchIdempotencyStore(database, userId, input, existing.session.id, response.data)
      if (!stored.success) return stored
      return createResult({ created: false, replayed: false, responseBody: response.data, session: existing.session })
    }

    const [created] = await database
      .insert(sessionTable)
      .values({
        clientRequestId: input.clientRequestId,
        id: input.id ?? uuidv7(),
        metadata: source.session.metadata,
        parentSessionId: source.session.id,
        projectPath: source.session.projectPath,
        primaryAgentId: source.session.primaryAgentId,
        serverId: source.session.serverId,
        title: source.session.title,
        userId,
      })
      .onConflictDoNothing({ target: [sessionTable.userId, sessionTable.clientRequestId] })
      .returning()
    if (created === undefined) {
      const [idempotent] = await database
        .select({ session: sessionTable })
        .from(sessionTable)
        .innerJoin(
          serverTable,
          and(eq(sessionTable.serverId, serverTable.id), eq(serverTable.organizationId, organizationId)),
        )
        .where(and(eq(sessionTable.userId, userId), eq(sessionTable.clientRequestId, input.clientRequestId)))
        .for("update")
        .limit(1)
      if (idempotent === undefined) return createResultError(op, "The branched session could not be created.")
      const response = sessionCreateMutationResponseCreate({ created: false, session: idempotent.session })
      if (!response.success) return response
      const stored = await sessionBranchIdempotencyStore(database, userId, input, idempotent.session.id, response.data)
      if (!stored.success) return stored
      return createResult({ created: false, replayed: false, responseBody: response.data, session: idempotent.session })
    }

    const copied = await messageCopyFinalizedPrefix(database, userId, sourceSessionId, created.id, input.messageId)
    if (!copied.success) return createResultError(op, copied.errorMessage)

    const response = sessionCreateMutationResponseCreate({ created: true, session: created })
    if (!response.success) return response
    const stored = await sessionBranchIdempotencyStore(database, userId, input, created.id, response.data)
    if (!stored.success) return stored
    return createResult({ created: true, replayed: false, responseBody: response.data, session: created })
  } catch (_error) {
    return createResultError(op, "The branched session could not be created.")
  }
}

async function sessionBranchIdempotencyLoad(
  database: DatabaseExecutor,
  userId: string,
  organizationId: string,
  input: { idempotencyKey?: string; requestHash?: string },
): Promise<Result<SessionBranchMutationResult | undefined>> {
  const op = "sessionRepositoryBranch"
  if (input.idempotencyKey === undefined) return createResult(undefined)
  if (input.requestHash === undefined) return createResultError(op, "The idempotency request hash is required.")

  const [idempotent] = await database
    .select()
    .from(mutationIdempotencyTable)
    .where(
      and(
        eq(mutationIdempotencyTable.userId, userId),
        eq(mutationIdempotencyTable.operation, sessionBranchOperation),
        eq(mutationIdempotencyTable.idempotencyKey, input.idempotencyKey),
      ),
    )
    .for("update")
    .limit(1)
  if (idempotent === undefined) return createResult(undefined)
  if (idempotent.requestHash !== input.requestHash) return idempotencyConflict(op)
  const response = v.safeParse(sessionCreateMutationResponseSchema, idempotent.responseBody)
  if (!response.success) return createResultError(op, "The stored idempotency response is invalid.")
  const [session] = await database
    .select({ session: sessionTable })
    .from(sessionTable)
    .innerJoin(
      serverTable,
      and(eq(sessionTable.serverId, serverTable.id), eq(serverTable.organizationId, organizationId)),
    )
    .where(and(eq(sessionTable.id, idempotent.resourceId), eq(sessionTable.userId, userId)))
    .limit(1)
  if (session === undefined) return createResultError(op, "The session could not be found.")
  return createResult({
    created: false,
    replayed: true,
    responseBody: { ...response.output, created: false },
    session: session.session,
  })
}

async function sessionBranchIdempotencyStore(
  database: DatabaseExecutor,
  userId: string,
  input: { idempotencyKey?: string; requestHash?: string },
  resourceId: string,
  response: SessionCreateMutationResponse,
): Promise<Result<void>> {
  const op = "sessionRepositoryBranch"
  if (input.idempotencyKey === undefined) return createResult(undefined)
  if (input.requestHash === undefined) return createResultError(op, "The idempotency request hash is required.")
  const inserted = await database
    .insert(mutationIdempotencyTable)
    .values({
      createdAt: new Date(),
      id: uuidv7(),
      idempotencyKey: input.idempotencyKey,
      operation: sessionBranchOperation,
      requestHash: input.requestHash,
      resourceId,
      responseBody: response,
      status: response.created ? 201 : 200,
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
  if (inserted.length > 0) return createResult(undefined)
  const [existing] = await database
    .select({ requestHash: mutationIdempotencyTable.requestHash })
    .from(mutationIdempotencyTable)
    .where(
      and(
        eq(mutationIdempotencyTable.userId, userId),
        eq(mutationIdempotencyTable.operation, sessionBranchOperation),
        eq(mutationIdempotencyTable.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1)
  if (existing?.requestHash === input.requestHash) return createResult(undefined)
  return idempotencyConflict(op)
}

function idempotencyConflict(op: string) {
  const result = createResultErrorCode(
    op,
    "The idempotency key was already used for a different request.",
    "idempotency_conflict",
  )
  result.statusCode = 409
  return result
}

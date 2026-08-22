import { createResult, createResultError, createResultErrorCode, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import * as v from "valibot"
import { mutationIdempotencyTable } from "../../api/db/mutationIdempotencyTable.js"
import { agentTable } from "../../agents/db/agentTable.js"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import {
  type SessionCreateMutationResponse,
  sessionCreateMutationResponseSchema,
} from "../api/sessionCreateMutationResponseSchema.js"
import { sessionCreateMutationResponseCreate } from "../api/sessionCreateMutationResponseCreate.js"
import { sessionTable } from "./sessionTable.js"

const sessionCreateOperation = "session.create"

type SessionCreateMutationResult = {
  created: boolean
  replayed: boolean
  responseBody?: SessionCreateMutationResponse
  session: typeof sessionTable.$inferSelect
}

export async function sessionRepositoryCreate(
  database: DatabaseExecutor,
  userId: string,
  organizationId: string,
  input: {
    clientRequestId: string
    id?: string
    idempotencyKey?: string
    metadata: Record<string, string>
    pinned?: boolean
    primaryAgentId: string
    projectPath?: string
    requestHash?: string
    serverId: string
    title: string
  },
): Promise<Result<SessionCreateMutationResult>> {
  const op = "sessionRepositoryCreate"

  try {
    if (input.idempotencyKey !== undefined && input.requestHash === undefined)
      return createResultError(op, "The idempotency request hash is required.")

    if (input.idempotencyKey !== undefined) {
      const replayed = await sessionCreateIdempotencyLoad(database, userId, organizationId, input)
      if (!replayed.success) return replayed
      if (replayed.data !== undefined) return createResult(replayed.data)
    }

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
      const stored = await sessionCreateIdempotencyStore(database, userId, input, existing.session.id, response.data)
      if (!stored.success) return stored
      return createResult({ created: false, replayed: false, responseBody: response.data, session: existing.session })
    }

    const [server] = await database
      .select({ id: serverTable.id })
      .from(serverTable)
      .where(and(eq(serverTable.id, input.serverId), eq(serverTable.organizationId, organizationId)))
      .limit(1)
    if (server === undefined) return createResultError(op, "The server could not be found.")

    const [agent] = await database
      .select({ id: agentTable.id })
      .from(agentTable)
      .where(and(eq(agentTable.id, input.primaryAgentId), eq(agentTable.serverId, input.serverId)))
      .limit(1)
    if (agent === undefined) return createResultError(op, "The agent could not be found.")

    const [created] = await database
      .insert(sessionTable)
      .values({
        clientRequestId: input.clientRequestId,
        id: input.id ?? uuidv7(),
        metadata: input.metadata,
        primaryAgentId: input.primaryAgentId,
        projectPath: input.projectPath ?? "~",
        serverId: input.serverId,
        title: input.title,
        userId,
        pinned: input.pinned ?? true,
      })
      .onConflictDoNothing({ target: [sessionTable.userId, sessionTable.clientRequestId] })
      .returning()

    if (created !== undefined) {
      const response = sessionCreateMutationResponseCreate({ created: true, session: created })
      if (!response.success) return response
      const stored = await sessionCreateIdempotencyStore(database, userId, input, created.id, response.data)
      if (!stored.success) return stored
      return createResult({ created: true, replayed: false, responseBody: response.data, session: created })
    }

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
    if (idempotent === undefined) return createResultError(op, "The session could not be created.")
    const response = sessionCreateMutationResponseCreate({ created: false, session: idempotent.session })
    if (!response.success) return response
    const stored = await sessionCreateIdempotencyStore(database, userId, input, idempotent.session.id, response.data)
    if (!stored.success) return stored
    return createResult({ created: false, replayed: false, responseBody: response.data, session: idempotent.session })
  } catch (_error) {
    return createResultError(op, "The session could not be created.")
  }
}

async function sessionCreateIdempotencyLoad(
  database: DatabaseExecutor,
  userId: string,
  organizationId: string,
  input: { idempotencyKey?: string; requestHash?: string },
): Promise<Result<SessionCreateMutationResult | undefined>> {
  const op = "sessionRepositoryCreate"
  if (input.idempotencyKey === undefined) return createResult(undefined)
  if (input.requestHash === undefined) return createResultError(op, "The idempotency request hash is required.")

  const [idempotent] = await database
    .select()
    .from(mutationIdempotencyTable)
    .where(
      and(
        eq(mutationIdempotencyTable.userId, userId),
        eq(mutationIdempotencyTable.operation, sessionCreateOperation),
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

async function sessionCreateIdempotencyStore(
  database: DatabaseExecutor,
  userId: string,
  input: { idempotencyKey?: string; requestHash?: string },
  resourceId: string,
  response: SessionCreateMutationResponse,
): Promise<Result<void>> {
  const op = "sessionRepositoryCreate"
  if (input.idempotencyKey === undefined) return createResult(undefined)
  if (input.requestHash === undefined) return createResultError(op, "The idempotency request hash is required.")

  const inserted = await database
    .insert(mutationIdempotencyTable)
    .values({
      createdAt: new Date(),
      id: uuidv7(),
      idempotencyKey: input.idempotencyKey,
      operation: sessionCreateOperation,
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
        eq(mutationIdempotencyTable.operation, sessionCreateOperation),
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

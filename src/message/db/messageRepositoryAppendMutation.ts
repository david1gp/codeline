import { createResult, createResultError, createResultErrorCode, type Result } from "@adaptive-ds/result"
import { and, eq, max, sql } from "drizzle-orm"
import * as v from "valibot"
import { mutationIdempotencyTable } from "../../api/db/mutationIdempotencyTable.js"
import { apiIdempotencyRequestHashCreate } from "../../api/idempotency/apiIdempotencyRequestHashCreate.js"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { databaseExecutorTransactionRun } from "../../database/databaseExecutorTransactionRun.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { messageAppendResponseCreate } from "../api/messageAppendResponseCreate.js"
import { type MessageAppendResponse, messageAppendResponseSchema } from "../api/messageAppendResponseSchema.js"
import { type MessageAppendRequest, messageAppendRequestSchema } from "../schema/messageAppendRequestSchema.js"
import { messageTable } from "./messageTable.js"

const messageAppendOperation = "message.append"

type MessageRepositoryAppendMutationResult = {
  created: boolean
  replayed: boolean
  responseBody: MessageAppendResponse
  revision: number
}

export async function messageRepositoryAppendMutation(
  database: DatabaseExecutor,
  userId: string,
  organizationId: string,
  sessionId: string,
  input: MessageAppendRequest,
): Promise<Result<MessageRepositoryAppendMutationResult>> {
  const op = "messageRepositoryAppendMutation"
  const parsedInput = v.safeParse(messageAppendRequestSchema, input)
  if (!parsedInput.success) return createResultError(op, "The message request is invalid.")
  const requestHash = apiIdempotencyRequestHashCreate({
    content: parsedInput.output.content,
    role: parsedInput.output.role,
    sessionId,
  })

  return databaseExecutorTransactionRun<MessageRepositoryAppendMutationResult>(database, async (executor) => {
    try {
      const [authorized] = await executor
        .select({ session: sessionTable })
        .from(sessionTable)
        .innerJoin(
          serverTable,
          and(eq(sessionTable.serverId, serverTable.id), eq(serverTable.organizationId, organizationId)),
        )
        .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
        .limit(1)
      if (authorized === undefined) return createResultError(op, "The session could not be found.")

      const [idempotent] = await executor
        .select()
        .from(mutationIdempotencyTable)
        .where(
          and(
            eq(mutationIdempotencyTable.userId, userId),
            eq(mutationIdempotencyTable.operation, messageAppendOperation),
            eq(mutationIdempotencyTable.idempotencyKey, parsedInput.output.clientRequestId),
          ),
        )
        .limit(1)
      if (idempotent !== undefined) {
        if (idempotent.requestHash !== requestHash || idempotent.resourceId !== sessionId)
          return idempotencyConflict(op)
        const response = v.safeParse(messageAppendResponseSchema, idempotent.responseBody)
        if (!response.success) return createResultError(op, "The stored idempotency response is invalid.")
        return createResult({
          created: false,
          replayed: true,
          responseBody: { ...response.output, created: false },
          revision: authorized.session.revision,
        })
      }

      if (authorized.session.archivedAt !== null) return createResultError(op, "The session is archived.")

      const [existing] = await executor
        .select()
        .from(messageTable)
        .where(
          and(
            eq(messageTable.sessionId, sessionId),
            eq(messageTable.clientRequestId, parsedInput.output.clientRequestId),
          ),
        )
        .limit(1)
      if (existing !== undefined) {
        if (existing.role !== parsedInput.output.role || existing.content !== parsedInput.output.content)
          return idempotencyConflict(op, "The message client request ID was already used with different content.")
        const response = messageAppendResponseCreate({ created: false, message: existing })
        if (!response.success) return response
        const stored = await messageIdempotencyStore(
          executor,
          userId,
          sessionId,
          parsedInput.output.clientRequestId,
          requestHash,
          response.data,
          200,
        )
        if (!stored.success) return stored
        return createResult({
          created: false,
          replayed: false,
          responseBody: response.data,
          revision: authorized.session.revision,
        })
      }

      const [last] = await executor
        .select({ sequence: max(messageTable.sequence) })
        .from(messageTable)
        .where(eq(messageTable.sessionId, sessionId))
        .limit(1)
      const sequence = (last?.sequence ?? 0) + 1
      const [message] = await executor
        .insert(messageTable)
        .values({
          agentId: authorized.session.primaryAgentId,
          clientRequestId: parsedInput.output.clientRequestId,
          content: parsedInput.output.content,
          id: uuidv7(),
          metadata: {},
          role: parsedInput.output.role,
          sequence,
          sessionId,
        })
        .returning()
      if (message === undefined) return createResultError(op, "The message could not be appended.")

      const [updatedSession] = await executor
        .update(sessionTable)
        .set({ revision: sql`${sessionTable.revision} + 1`, updatedAt: new Date() })
        .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
        .returning({ revision: sessionTable.revision })
      if (updatedSession === undefined) return createResultError(op, "The session could not be updated.")

      const response = messageAppendResponseCreate({ created: true, message })
      if (!response.success) return response
      const stored = await messageIdempotencyStore(
        executor,
        userId,
        sessionId,
        parsedInput.output.clientRequestId,
        requestHash,
        response.data,
        201,
      )
      if (!stored.success) return stored
      return createResult({
        created: true,
        replayed: false,
        responseBody: response.data,
        revision: updatedSession.revision,
      })
    } catch (_error) {
      return createResultError(op, "The message could not be appended.")
    }
  })
}

async function messageIdempotencyStore(
  database: DatabaseExecutor,
  userId: string,
  resourceId: string,
  idempotencyKey: string,
  requestHash: string,
  responseBody: MessageAppendResponse,
  status: number,
): Promise<Result<void>> {
  const op = "messageRepositoryAppendMutation"
  const [inserted] = await database
    .insert(mutationIdempotencyTable)
    .values({
      createdAt: new Date(),
      id: uuidv7(),
      idempotencyKey,
      operation: messageAppendOperation,
      requestHash,
      resourceId,
      responseBody,
      status,
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
  if (inserted !== undefined) return createResult(undefined)

  const [existing] = await database
    .select({ requestHash: mutationIdempotencyTable.requestHash })
    .from(mutationIdempotencyTable)
    .where(
      and(
        eq(mutationIdempotencyTable.userId, userId),
        eq(mutationIdempotencyTable.operation, messageAppendOperation),
        eq(mutationIdempotencyTable.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1)
  if (existing?.requestHash === requestHash) return createResult(undefined)
  return idempotencyConflict(op)
}

function idempotencyConflict(op: string, message = "The idempotency key was already used for a different request.") {
  const result = createResultErrorCode(op, message, "idempotency_conflict")
  result.statusCode = 409
  return result
}

import { createResult, createResultError, createResultErrorCode, type Result } from "@adaptive-ds/result"
import { and, eq, isNull, sql } from "drizzle-orm"
import * as v from "valibot"
import { mutationIdempotencyTable } from "../../api/db/mutationIdempotencyTable.js"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { sessionDetailResponseCreate } from "../api/sessionDetailResponseCreate.js"
import { type SessionDetailResponse, sessionDetailResponseSchema } from "../api/sessionDetailResponseSchema.js"
import { sessionRepresentationEtagCreate } from "../api/sessionRepresentationEtagCreate.js"
import { sessionPreconditionConflictCreate } from "./sessionPreconditionConflictCreate.js"
import { sessionTable } from "./sessionTable.js"

const sessionPinOperation = "session.pin"

export async function sessionRepositoryPin(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  pinned: boolean,
  options?: {
    expectedEtag?: string
    idempotencyKey?: string
    organizationId?: string
    requireIfMatch?: boolean
    requestHash?: string
  },
): Promise<
  Result<
    typeof sessionTable.$inferSelect & {
      replayed: boolean
      responseBody?: SessionDetailResponse
    }
  >
> {
  const op = "sessionRepositoryPin"

  try {
    const [lockedSession] =
      options?.organizationId === undefined
        ? await database
            .select()
            .from(sessionTable)
            .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
            .limit(1)
        : await database
            .select({ session: sessionTable })
            .from(sessionTable)
            .innerJoin(
              serverTable,
              and(eq(sessionTable.serverId, serverTable.id), eq(serverTable.organizationId, options.organizationId)),
            )
            .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
            .limit(1)
            .then((rows) => (rows[0] === undefined ? [] : [rows[0].session]))
    if (lockedSession === undefined) return createResultError(op, "The session could not be found.")

    if (options?.idempotencyKey !== undefined) {
      if (options.requestHash === undefined) return createResultError(op, "The idempotency request hash is required.")
      const [idempotent] = await database
        .select()
        .from(mutationIdempotencyTable)
        .where(
          and(
            eq(mutationIdempotencyTable.userId, userId),
            eq(mutationIdempotencyTable.operation, sessionPinOperation),
            eq(mutationIdempotencyTable.idempotencyKey, options.idempotencyKey),
          ),
        )
        .limit(1)
      if (idempotent !== undefined) {
        if (idempotent.resourceId !== sessionId || idempotent.requestHash !== options.requestHash)
          return idempotencyConflict(op)
        const response = v.safeParse(sessionDetailResponseSchema, idempotent.responseBody)
        if (!response.success) return createResultError(op, "The stored idempotency response is invalid.")
        return createResult({ ...lockedSession, replayed: true, responseBody: response.output })
      }
    }

    if (
      (options?.requireIfMatch === true || options?.expectedEtag !== undefined) &&
      (options.expectedEtag === undefined ||
        options.expectedEtag !== sessionRepresentationEtagCreate(lockedSession.id, lockedSession.revision))
    )
      return sessionPreconditionConflictCreate(op, "The session changed before it could be pinned.", lockedSession)
    if (lockedSession.archivedAt !== null) return createResultError(op, "The session is archived.")

    const [session] = await database
      .update(sessionTable)
      .set({ pinned, revision: sql`${sessionTable.revision} + 1`, updatedAt: new Date() })
      .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId), isNull(sessionTable.archivedAt)))
      .returning()
    if (session === undefined) return createResultError(op, "The session could not be pinned.")

    const response = sessionDetailResponseCreate({
      agent: { id: session.primaryAgentId },
      server: { id: session.serverId },
      session,
    })
    if (!response.success) return response

    if (options?.idempotencyKey !== undefined && options.requestHash !== undefined) {
      const inserted = await database
        .insert(mutationIdempotencyTable)
        .values({
          createdAt: new Date(),
          id: uuidv7(),
          idempotencyKey: options.idempotencyKey,
          operation: sessionPinOperation,
          requestHash: options.requestHash,
          resourceId: sessionId,
          responseBody: response.data,
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
      if (inserted.length === 0) return idempotencyConflict(op)
    }

    return createResult({ ...session, replayed: false, responseBody: response.data })
  } catch (_error) {
    return createResultError(op, "The session could not be pinned.")
  }
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

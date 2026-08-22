import { createResult, createResultError, createResultErrorCode, type Result } from "@adaptive-ds/result"
import { and, eq, inArray, sql } from "drizzle-orm"
import * as v from "valibot"
import { mutationIdempotencyTable } from "../../api/db/mutationIdempotencyTable.js"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { sessionDeleteResponseCreate } from "../api/sessionDeleteResponseCreate.js"
import { type SessionDeleteResponse, sessionDeleteResponseSchema } from "../api/sessionDeleteResponseSchema.js"
import { sessionRepresentationEtagCreate } from "../api/sessionRepresentationEtagCreate.js"
import { sessionPreconditionConflictCreate } from "./sessionPreconditionConflictCreate.js"
import { sessionTable } from "./sessionTable.js"

const sessionDeleteOperation = "session.delete"
type SessionDeleteMutationResult = Pick<typeof sessionTable.$inferSelect, "id"> &
  Partial<Omit<typeof sessionTable.$inferSelect, "id">> & {
    affectedSessions: Array<Pick<typeof sessionTable.$inferSelect, "id" | "revision">>
    replayed: boolean
    responseBody?: SessionDeleteResponse
  }

export async function sessionRepositoryDelete(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  options?: {
    expectedEtag?: string
    idempotencyKey?: string
    organizationId?: string
    requireIfMatch?: boolean
    requestHash?: string
  },
): Promise<Result<SessionDeleteMutationResult>> {
  const op = "sessionRepositoryDelete"

  try {
    const [lockedSession] =
      options?.organizationId === undefined
        ? await database
            .select()
            .from(sessionTable)
            .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
            .for("update")
            .limit(1)
        : await database
            .select({ session: sessionTable })
            .from(sessionTable)
            .innerJoin(
              serverTable,
              and(eq(sessionTable.serverId, serverTable.id), eq(serverTable.organizationId, options.organizationId)),
            )
            .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
            .for("update")
            .limit(1)
            .then((rows) => (rows[0] === undefined ? [] : [rows[0].session]))

    if (lockedSession === undefined) {
      const replayed = await sessionDeleteIdempotencyLoad(database, userId, sessionId, options)
      if (!replayed.success) return replayed
      if (replayed.data !== undefined) return createResult({ affectedSessions: [], id: sessionId, ...replayed.data })
      return createResultError(op, "The session could not be found.")
    }

    const replayed = await sessionDeleteIdempotencyLoad(database, userId, sessionId, options)
    if (!replayed.success) return replayed
    if (replayed.data !== undefined) return createResult({ affectedSessions: [], ...lockedSession, ...replayed.data })

    if (
      (options?.requireIfMatch === true || options?.expectedEtag !== undefined) &&
      (options.expectedEtag === undefined ||
        options.expectedEtag !== sessionRepresentationEtagCreate(lockedSession.id, lockedSession.revision))
    )
      return sessionPreconditionConflictCreate(op, "The session changed before it could be deleted.", lockedSession)

    const childWhere =
      options?.organizationId === undefined
        ? and(eq(sessionTable.parentSessionId, sessionId), eq(sessionTable.userId, userId))
        : and(
            eq(sessionTable.parentSessionId, sessionId),
            eq(sessionTable.userId, userId),
            inArray(
              sessionTable.serverId,
              database
                .select({ id: serverTable.id })
                .from(serverTable)
                .where(eq(serverTable.organizationId, options.organizationId)),
            ),
          )
    const affectedSessions = await database
      .update(sessionTable)
      .set({ revision: sql`${sessionTable.revision} + 1`, updatedAt: new Date() })
      .where(childWhere)
      .returning({ id: sessionTable.id, revision: sessionTable.revision })

    const [session] = await database
      .delete(sessionTable)
      .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
      .returning()
    if (session === undefined) return createResultError(op, "The session could not be found.")

    const response = sessionDeleteResponseCreate(session)
    if (!response.success) return response

    if (options?.idempotencyKey !== undefined && options.requestHash !== undefined) {
      const inserted = await database
        .insert(mutationIdempotencyTable)
        .values({
          createdAt: new Date(),
          id: uuidv7(),
          idempotencyKey: options.idempotencyKey,
          operation: sessionDeleteOperation,
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

    return createResult({ affectedSessions, ...session, replayed: false, responseBody: response.data })
  } catch (_error) {
    return createResultError(op, "The session could not be deleted.")
  }
}

async function sessionDeleteIdempotencyLoad(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  options:
    | {
        idempotencyKey?: string
        requestHash?: string
      }
    | undefined,
): Promise<Result<Pick<SessionDeleteMutationResult, "replayed" | "responseBody"> | undefined>> {
  const op = "sessionRepositoryDelete"
  if (options?.idempotencyKey === undefined) return createResult(undefined)
  if (options.requestHash === undefined) return createResultError(op, "The idempotency request hash is required.")

  const [idempotent] = await database
    .select()
    .from(mutationIdempotencyTable)
    .where(
      and(
        eq(mutationIdempotencyTable.userId, userId),
        eq(mutationIdempotencyTable.operation, sessionDeleteOperation),
        eq(mutationIdempotencyTable.idempotencyKey, options.idempotencyKey),
      ),
    )
    .for("update")
    .limit(1)
  if (idempotent === undefined) return createResult(undefined)
  if (idempotent.resourceId !== sessionId || idempotent.requestHash !== options.requestHash)
    return idempotencyConflict(op)
  const response = v.safeParse(sessionDeleteResponseSchema, idempotent.responseBody)
  if (!response.success) return createResultError(op, "The stored idempotency response is invalid.")
  return createResult({ affectedSessions: [], replayed: true, responseBody: response.output })
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

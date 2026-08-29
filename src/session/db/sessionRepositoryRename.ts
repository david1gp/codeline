import { createResult, createResultError, createResultErrorCode, type Result } from "@adaptive-ds/result"
import { and, eq, sql } from "drizzle-orm"
import * as v from "valibot"
import { mutationIdempotencyTable } from "../../api/db/mutationIdempotencyTable.js"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { projectRegistryProjectIdResolve } from "../../project/projectRegistryProjectIdResolve.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { sessionRenameResponseCreate } from "../api/sessionRenameResponseCreate.js"
import { type SessionRenameResponse, sessionRenameResponseSchema } from "../api/sessionRenameResponseSchema.js"
import { sessionRepresentationEtagCreate } from "../api/sessionRepresentationEtagCreate.js"
import { sessionPreconditionConflictCreate } from "./sessionPreconditionConflictCreate.js"
import { sessionTable } from "./sessionTable.js"

const sessionRenameOperation = "session.rename"

export async function sessionRepositoryRename(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  title: string,
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
      responseBody?: SessionRenameResponse
    }
  >
> {
  const op = "sessionRepositoryRename"

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
            eq(mutationIdempotencyTable.operation, sessionRenameOperation),
            eq(mutationIdempotencyTable.idempotencyKey, options.idempotencyKey),
          ),
        )
        .limit(1)
      if (idempotent !== undefined) {
        if (idempotent.resourceId !== sessionId || idempotent.requestHash !== options.requestHash)
          return idempotencyConflict(op)
        const response = v.safeParse(sessionRenameResponseSchema, idempotent.responseBody)
        if (!response.success) return createResultError(op, "The stored idempotency response is invalid.")
        const projectId = await projectRegistryProjectIdResolve(database, userId, lockedSession.projectPath)
        if (!projectId.success) return createResultError(op, projectId.errorMessage)
        const currentResponse = await sessionRenameResponseCreate(lockedSession, userId, projectId.data)
        if (!currentResponse.success) return currentResponse
        return createResult({ ...lockedSession, replayed: true, responseBody: currentResponse.data })
      }
    }

    if (
      (options?.requireIfMatch === true || options?.expectedEtag !== undefined) &&
      (options.expectedEtag === undefined ||
        options.expectedEtag !== sessionPreconditionEtagCreate(lockedSession.id, lockedSession.revision))
    )
      return sessionPreconditionConflictCreate(op, "The session changed before it could be renamed.", lockedSession)
    if (lockedSession.archivedAt !== null) return createResultError(op, "The session is archived.")

    const [updated] = await database
      .update(sessionTable)
      .set({ revision: sql`${sessionTable.revision} + 1`, title, updatedAt: new Date() })
      .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
      .returning()
    if (updated === undefined) return createResultError(op, "The session could not be renamed.")

    const projectId = await projectRegistryProjectIdResolve(database, userId, updated.projectPath)
    if (!projectId.success) return createResultError(op, projectId.errorMessage)
    const response = await sessionRenameResponseCreate(updated, userId, projectId.data)
    if (!response.success) return response

    if (options?.idempotencyKey !== undefined && options.requestHash !== undefined) {
      const inserted = await database
        .insert(mutationIdempotencyTable)
        .values({
          createdAt: new Date(),
          id: uuidv7(),
          idempotencyKey: options.idempotencyKey,
          operation: sessionRenameOperation,
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

    return createResult({ ...updated, replayed: false, responseBody: response.data })
  } catch (_error) {
    return createResultError(op, "The session could not be renamed.")
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

function sessionPreconditionEtagCreate(sessionId: string, revision: number): string {
  return sessionRepresentationEtagCreate(sessionId, revision)
}

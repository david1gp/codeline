import { createResult, createResultError, createResultErrorCode, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import * as v from "valibot"
import { mutationIdempotencyTable } from "../../api/db/mutationIdempotencyTable.js"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { projectRegistryProjectIdResolve } from "../../project/actions/projectRegistryProjectIdResolve.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { sessionCreateMutationResponseCreate } from "../api/sessionCreateMutationResponseCreate.js"
import {
  type SessionCreateMutationResponse,
  sessionCreateMutationResponseSchema,
} from "../api/sessionCreateMutationResponseSchema.js"
import { sessionTable } from "./sessionTable.js"

export async function sessionRepositoryCreateReplayLoad(
  database: DatabaseExecutor,
  userId: string,
  organizationId: string,
  input: { idempotencyKey?: string; requestHash?: string },
): Promise<
  Result<
    | {
        created: false
        replayed: true
        responseBody: SessionCreateMutationResponse
        session: typeof sessionTable.$inferSelect
      }
    | undefined
  >
> {
  const op = "sessionRepositoryCreate"
  if (input.idempotencyKey === undefined) return createResult(undefined)
  if (input.requestHash === undefined) return createResultError(op, "The idempotency request hash is required.")

  try {
    const [idempotent] = await database
      .select()
      .from(mutationIdempotencyTable)
      .where(
        and(
          eq(mutationIdempotencyTable.userId, userId),
          eq(mutationIdempotencyTable.operation, "session.create"),
          eq(mutationIdempotencyTable.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1)
    if (idempotent === undefined) return createResult(undefined)
    if (idempotent.requestHash !== input.requestHash) {
      const conflict = createResultErrorCode(
        op,
        "The idempotency key was already used for a different request.",
        "idempotency_conflict",
      )
      conflict.statusCode = 409
      return conflict
    }

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
    const projectId = await projectRegistryProjectIdResolve(database, userId, session.session.projectPath)
    if (!projectId.success) return createResultError(op, projectId.errorMessage)
    const currentResponse = sessionCreateMutationResponseCreate({
      created: false,
      projectId: projectId.data,
      session: session.session,
      userId,
    })
    if (!currentResponse.success) return currentResponse
    return createResult({
      created: false,
      replayed: true,
      responseBody: currentResponse.data,
      session: session.session,
    })
  } catch {
    return createResultError(op, "The session could not be created.")
  }
}

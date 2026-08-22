import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericMutationCtx } from "convex/server"
import * as v from "valibot"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { sessionCreateRequestSchema } from "../schema/sessionCreateRequestSchema.js"
import { sessionDocumentPublic } from "./sessionDocumentPublic.js"
import type { SessionListRow } from "./sessionListRow.js"

type SessionMutationContext = Pick<GenericMutationCtx<any>, "db">

export async function sessionCreate(
  context: SessionMutationContext,
  userId: string,
  organizationId: string,
  input: unknown,
): Promise<Result<{ created: boolean; session: SessionListRow["session"] }>> {
  const op = "sessionCreate"
  const parsed = v.safeParse(sessionCreateRequestSchema, input)
  if (!parsed.success) return createResultError(op, "The session creation input is invalid.")

  try {
    const existing = await context.db
      .query("sessions")
      .withIndex("userIdClientRequestId", (query: any) =>
        query.eq("userId", userId).eq("clientRequestId", parsed.output.clientRequestId),
      )
      .first()
    if (existing !== null) {
      const existingServer = await context.db
        .query("servers")
        .withIndex("id", (query: any) => query.eq("id", existing.serverId))
        .first()
      if (existingServer?.organizationId === organizationId)
        return createResult({ created: false, session: sessionDocumentPublic(existing) })
    }

    const server = await context.db
      .query("servers")
      .withIndex("id", (query: any) => query.eq("id", parsed.output.serverId))
      .first()
    if (server === null || server.organizationId !== organizationId)
      return createResultError(op, "The server could not be found.")

    const agent = await context.db
      .query("agents")
      .withIndex("serverIdId", (query: any) =>
        query.eq("serverId", parsed.output.serverId).eq("id", parsed.output.primaryAgentId),
      )
      .first()
    if (agent === null) return createResultError(op, "The agent could not be found.")

    const now = Date.now()
    const document = {
      clientRequestId: parsed.output.clientRequestId,
      createdAt: now,
      id: uuidv7(),
      metadata: parsed.output.metadata,
      pinned: true,
      primaryAgentId: parsed.output.primaryAgentId,
      projectPath: parsed.output.projectPath ?? "~",
      serverId: parsed.output.serverId,
      title: parsed.output.title,
      updatedAt: now,
      userId,
    }
    await context.db.insert("sessions", document)
    return createResult({ created: true, session: sessionDocumentPublic(document) })
  } catch (_error) {
    try {
      const idempotent = await context.db
        .query("sessions")
        .withIndex("userIdClientRequestId", (query: any) =>
          query.eq("userId", userId).eq("clientRequestId", parsed.output.clientRequestId),
        )
        .first()
      if (idempotent !== null) {
        const server = await context.db
          .query("servers")
          .withIndex("id", (query: any) => query.eq("id", idempotent.serverId))
          .first()
        if (server?.organizationId === organizationId)
          return createResult({ created: false, session: sessionDocumentPublic(idempotent) })
      }
    } catch (_idempotencyError) {
      return createResultError(op, "The session could not be created.")
    }
    return createResultError(op, "The session could not be created.")
  }
}

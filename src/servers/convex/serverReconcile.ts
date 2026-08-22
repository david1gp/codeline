import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericMutationCtx } from "convex/server"

export type ServerReconcileInput = {
  createdAt: number
  endpoint: string
  id: string
  metadata: unknown
  name: string
  organizationId: string
  updatedAt: number
}

type ServerMutationContext = Pick<GenericMutationCtx<any>, "db">

export async function serverReconcile(
  context: ServerMutationContext,
  input: ServerReconcileInput,
): Promise<Result<void>> {
  const op = "serverReconcile"

  try {
    const existing = await context.db
      .query("servers")
      .withIndex("id", (query: any) => query.eq("id", input.id))
      .first()
    if (existing !== null && existing.organizationId !== input.organizationId) {
      return createResultError(op, "The server belongs to another organization.")
    }

    const sameName = await context.db
      .query("servers")
      .withIndex("organizationIdName", (query: any) =>
        query.eq("organizationId", input.organizationId).eq("name", input.name),
      )
      .first()
    if (sameName !== null && sameName.id !== input.id) {
      return createResultError(op, "The server name is already in use.")
    }

    const fields = {
      createdAt: input.createdAt,
      endpoint: input.endpoint,
      id: input.id,
      metadata: input.metadata,
      name: input.name,
      organizationId: input.organizationId,
      updatedAt: input.updatedAt,
    }
    if (existing === null) await context.db.insert("servers", fields)
    else await context.db.replace("servers", existing._id, fields)
    return createResult(undefined)
  } catch (_error) {
    return createResultError(op, "The server could not be reconciled.")
  }
}

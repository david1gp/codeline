import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericMutationCtx } from "convex/server"
import * as v from "valibot"
import type { AgentConfiguration } from "../schema/agentConfigurationSchema.js"
import { agentConfigurationSchema } from "../schema/agentConfigurationSchema.js"

export type AgentCatalogReconcileInput = {
  configuration: AgentConfiguration
  createdAt: number
  id: string
  name: string
  parentAgentId?: string
  role: string
  serverId: string
  sortOrder: number
  updatedAt: number
}

type AgentMutationContext = Pick<GenericMutationCtx<any>, "db">

export async function agentCatalogReconcile(
  context: AgentMutationContext,
  organizationId: string,
  inputs: readonly AgentCatalogReconcileInput[],
): Promise<Result<{ reconciledCount: number }>> {
  const op = "agentCatalogReconcile"
  const ids = new Set<string>()
  const names = new Set<string>()
  const desired = new Map<string, AgentCatalogReconcileInput>()

  for (const input of inputs) {
    if (ids.has(input.id)) return createResultError(op, "The provider catalog contains duplicate agent IDs.")
    if (names.has(`${input.serverId}\u0000${input.name}`))
      return createResultError(op, "The provider catalog contains duplicate agent names.")
    if (!Number.isInteger(input.sortOrder) || input.sortOrder < 0)
      return createResultError(op, "The provider catalog contains an invalid agent order.")
    const parsedConfiguration = v.safeParse(agentConfigurationSchema, input.configuration)
    if (!parsedConfiguration.success)
      return createResultError(op, "The provider catalog contains invalid configuration.")
    ids.add(input.id)
    names.add(`${input.serverId}\u0000${input.name}`)
    desired.set(input.id, { ...input, configuration: parsedConfiguration.output })
  }

  try {
    const serverIds = new Set(inputs.map((input) => input.serverId))
    for (const serverId of serverIds) {
      const server = await context.db
        .query("servers")
        .withIndex("id", (query: any) => query.eq("id", serverId))
        .first()
      if (server === null || server.organizationId !== organizationId)
        return createResultError(op, "The server could not be found.")
    }

    const existingDocuments = (
      await Promise.all(
        [...serverIds].map((serverId) =>
          context.db
            .query("agents")
            .withIndex("serverId", (query: any) => query.eq("serverId", serverId))
            .collect(),
        ),
      )
    ).flat() as any[]
    const existingById = new Map(existingDocuments.map((document) => [document.id, document]))
    const existingNames = new Map(
      existingDocuments.map((document) => [`${document.serverId}\u0000${document.name}`, document.id]),
    )

    for (const input of inputs) {
      const existing = existingById.get(input.id)
      if (existing !== undefined && existing.serverId !== input.serverId)
        return createResultError(op, "The catalog agent belongs to another server.")
      const sameNameId = existingNames.get(`${input.serverId}\u0000${input.name}`)
      if (sameNameId !== undefined && sameNameId !== input.id)
        return createResultError(op, "The provider catalog contains a duplicate agent name.")
      if (input.parentAgentId === input.id) return createResultError(op, "The agent hierarchy contains a cycle.")
      if (input.parentAgentId !== undefined) {
        const parent = desired.get(input.parentAgentId) ?? existingById.get(input.parentAgentId)
        if (parent === undefined || parent.serverId !== input.serverId)
          return createResultError(op, "The agent hierarchy contains an invalid parent.")
      }
    }

    const parentById = new Map<string, string | undefined>()
    for (const document of existingDocuments) parentById.set(document.id, document.parentAgentId)
    for (const input of inputs) parentById.set(input.id, input.parentAgentId)
    for (const input of inputs) {
      const visited = new Set<string>()
      let parentId = input.parentAgentId
      while (parentId !== undefined) {
        if (visited.has(parentId)) return createResultError(op, "The agent hierarchy contains a cycle.")
        visited.add(parentId)
        parentId = parentById.get(parentId)
      }
    }

    for (const input of inputs) {
      const existing = existingById.get(input.id)
      const document = {
        configuration: input.configuration,
        createdAt: input.createdAt,
        id: input.id,
        name: input.name,
        ...(input.parentAgentId === undefined ? {} : { parentAgentId: input.parentAgentId }),
        role: input.role,
        serverId: input.serverId,
        sortOrder: input.sortOrder,
        updatedAt: input.updatedAt,
      }
      if (existing === undefined) await context.db.insert("agents", document)
      else await context.db.replace("agents", existing._id, document)
    }
    return createResult({ reconciledCount: inputs.length })
  } catch (_error) {
    return createResultError(op, "The provider agent catalog could not be reconciled.")
  }
}

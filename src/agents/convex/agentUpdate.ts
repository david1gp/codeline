import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericMutationCtx } from "convex/server"
import * as v from "valibot"
import { serverLoad } from "../../servers/convex/serverLoad.js"
import { agentConfigurationSchema } from "../schema/agentConfigurationSchema.js"
import { agentUpdateRequestSchema } from "../schema/agentUpdateRequestSchema.js"
import { agentDocumentPublic } from "./agentDocumentPublic.js"
import type { AgentRecord } from "./agentRecord.js"

type AgentMutationContext = Pick<GenericMutationCtx<any>, "db">

export async function agentUpdate(
  context: AgentMutationContext,
  organizationId: string,
  serverId: string,
  agentId: string,
  input: unknown,
): Promise<Result<AgentRecord>> {
  const op = "agentUpdate"
  const parsedInput = v.safeParse(agentUpdateRequestSchema, input)
  if (!parsedInput.success) return createResultError(op, "The agent update input is invalid.")
  if (parsedInput.output.configuration !== undefined) {
    const parsedConfiguration = v.safeParse(agentConfigurationSchema, parsedInput.output.configuration)
    if (!parsedConfiguration.success) return createResultError(op, "The agent update input is invalid.")
  }

  const server = await serverLoad(context, organizationId, serverId)
  if (!server.success) return createResultError(op, server.errorMessage)

  try {
    const existing = await context.db
      .query("agents")
      .withIndex("serverIdId", (query: any) => query.eq("serverId", serverId).eq("id", agentId))
      .first()
    if (existing === null) return createResultError(op, "The agent could not be found.")

    if (parsedInput.output.name !== undefined && parsedInput.output.name !== existing.name) {
      const sameName = await context.db
        .query("agents")
        .withIndex("serverIdName", (query: any) => query.eq("serverId", serverId).eq("name", parsedInput.output.name))
        .first()
      if (sameName !== null && sameName.id !== agentId)
        return createResultError(op, "The agent name is already in use.")
    }

    const configuration =
      parsedInput.output.configuration === undefined
        ? v.safeParse(agentConfigurationSchema, existing.configuration)
        : { success: true as const, output: parsedInput.output.configuration }
    if (!configuration.success) return createResultError(op, "The agent configuration could not be loaded.")

    const document = {
      configuration: configuration.output,
      createdAt: existing.createdAt,
      id: existing.id,
      name: parsedInput.output.name ?? existing.name,
      ...(existing.parentAgentId === undefined ? {} : { parentAgentId: existing.parentAgentId }),
      role: parsedInput.output.role ?? existing.role,
      serverId: existing.serverId,
      sortOrder: existing.sortOrder,
      updatedAt: Date.now(),
    }
    await context.db.replace("agents", existing._id, document)
    return createResult(agentDocumentPublic(document))
  } catch (_error) {
    return createResultError(op, "The agent could not be updated.")
  }
}

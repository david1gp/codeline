import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericMutationCtx } from "convex/server"
import * as v from "valibot"
import { serverLoad } from "../../servers/convex/serverLoad.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { agentConfigurationSchema } from "../schema/agentConfigurationSchema.js"
import { agentCreateRequestSchema } from "../schema/agentCreateRequestSchema.js"
import { agentDocumentPublic } from "./agentDocumentPublic.js"
import type { AgentRecord } from "./agentRecord.js"

type AgentMutationContext = Pick<GenericMutationCtx<any>, "db">

export async function agentCreate(
  context: AgentMutationContext,
  organizationId: string,
  serverId: string,
  input: unknown,
): Promise<Result<AgentRecord>> {
  const op = "agentCreate"
  const parsedInput = v.safeParse(agentCreateRequestSchema, input)
  if (!parsedInput.success) return createResultError(op, "The agent creation input is invalid.")
  const parsedConfiguration = v.safeParse(agentConfigurationSchema, parsedInput.output.configuration)
  if (!parsedConfiguration.success) return createResultError(op, "The agent creation input is invalid.")

  const server = await serverLoad(context, organizationId, serverId)
  if (!server.success) return createResultError(op, server.errorMessage)

  try {
    const sameName = await context.db
      .query("agents")
      .withIndex("serverIdName", (query: any) => query.eq("serverId", serverId).eq("name", parsedInput.output.name))
      .first()
    if (sameName !== null) return createResultError(op, "The agent name is already in use.")

    const now = Date.now()
    const document = {
      configuration: parsedConfiguration.output,
      createdAt: now,
      id: uuidv7(),
      name: parsedInput.output.name,
      role: parsedInput.output.role,
      serverId,
      sortOrder: 0,
      updatedAt: now,
    }
    await context.db.insert("agents", document)
    return createResult(agentDocumentPublic(document))
  } catch (_error) {
    return createResultError(op, "The agent could not be created.")
  }
}

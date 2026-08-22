import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericQueryCtx } from "convex/server"
import * as v from "valibot"
import { serverLoad } from "../../servers/convex/serverLoad.js"
import type { ServerRecord } from "../../servers/convex/serverRecord.js"
import { agentConfigurationSchema } from "../schema/agentConfigurationSchema.js"
import { agentDocumentPublic } from "./agentDocumentPublic.js"
import type { AgentRecord } from "./agentRecord.js"

export type AgentLoadResult = {
  agent: AgentRecord
  server: ServerRecord
}

type AgentQueryContext = Pick<GenericQueryCtx<any>, "db">

export async function agentLoad(
  context: AgentQueryContext,
  organizationId: string,
  serverId: string,
  agentId: string,
): Promise<Result<AgentLoadResult>> {
  const op = "agentLoad"
  const server = await serverLoad(context, organizationId, serverId)
  if (!server.success) return createResultError(op, server.errorMessage)

  try {
    const document = await context.db
      .query("agents")
      .withIndex("serverIdId", (query: any) => query.eq("serverId", serverId).eq("id", agentId))
      .first()
    if (document === null) return createResultError(op, "The agent could not be found.")

    const parsedConfiguration = v.safeParse(agentConfigurationSchema, document.configuration)
    if (!parsedConfiguration.success) return createResultError(op, "The agent configuration could not be loaded.")
    return createResult({
      agent: agentDocumentPublic({ ...document, configuration: parsedConfiguration.output }),
      server: server.data,
    })
  } catch (_error) {
    return createResultError(op, "The agent could not be loaded.")
  }
}

import { createResultErrorCode, type Result } from "@adaptive-ds/result"
import { eq } from "drizzle-orm"
import * as v from "valibot"
import { agentTable } from "../../agents/db/agentTable.js"
import { agentConfigurationSchema } from "../../agents/schema/agentConfigurationSchema.js"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import type { ProviderCatalog } from "../../providers/schema/providerCatalogSchema.js"
import { sessionExecutionSelectionErrorCodes } from "../errors/sessionExecutionSelectionErrorCodes.js"
import { type SessionExecutionSelection } from "../schema/sessionExecutionSelectionSchema.js"
import { sessionExecutionSelectionAgentDefaultsResolve } from "./sessionExecutionSelectionAgentDefaultsResolve.js"

export async function sessionExecutionSelectionAgentDefaultsLoad(
  database: DatabaseExecutor,
  serverId: string,
  primaryAgentId: string,
  options: { catalog?: ProviderCatalog } = {},
): Promise<Result<SessionExecutionSelection>> {
  const op = "sessionExecutionSelectionAgentDefaultsLoad"
  if (options.catalog !== undefined)
    return sessionExecutionSelectionAgentDefaultsResolve(
      primaryAgentId,
      options.catalog.agents.map((agent) => ({
        agentId: agent.id,
        enabled: agent.enabled,
        mode: agent.mode,
        tools: agent.tools,
      })),
    )

  try {
    const agents = await database
      .select({ configuration: agentTable.configuration, id: agentTable.id })
      .from(agentTable)
      .where(eq(agentTable.serverId, serverId))
    return sessionExecutionSelectionAgentDefaultsResolve(
      primaryAgentId,
      agents.map(({ configuration, id }) => {
        const parsed = v.safeParse(agentConfigurationSchema, configuration)
        return { agentId: id, tools: parsed.success ? parsed.output.tools : undefined }
      }),
    )
  } catch (_error) {
    return createResultErrorCode(
      op,
      "The agent execution defaults could not be loaded.",
      sessionExecutionSelectionErrorCodes.agentDefaultsLoadFailed,
    )
  }
}

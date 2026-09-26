import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { AgentConfiguration } from "../../agents/schema/agentConfigurationSchema.js"
import type { ProviderCatalog } from "../schema/providerCatalogSchema.js"
import { providerAgentCatalogConfigurationCompile } from "./providerAgentCatalogConfigurationCompile.js"

export function providerAgentCatalogConfigurationResolve(
  catalog: ProviderCatalog | undefined,
  agentId: string,
): Result<AgentConfiguration> {
  const op = "providerAgentCatalogConfigurationResolve"
  const agent = catalog?.agents.find(({ id }) => id === agentId)
  if (catalog === undefined || agent === undefined || !agent.enabled)
    return createResultError(op, "The project agent is unavailable.")
  const compiled = providerAgentCatalogConfigurationCompile({ ...catalog, agents: [agent] })
  if (!compiled.success) return compiled
  const configuration = compiled.data[0]?.configuration
  if (configuration === undefined) return createResultError(op, "The project agent configuration is unavailable.")
  return createResult(configuration)
}

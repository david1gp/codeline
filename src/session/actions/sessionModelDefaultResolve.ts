import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import { agentTable } from "../../agents/db/agentTable.js"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { providerAgentCatalogExecutionResolve } from "../../providers/catalog/providerAgentCatalogExecutionResolve.js"
import { providerAgentCatalogConfigurationResolve } from "../../providers/catalog/providerAgentCatalogConfigurationResolve.js"
import { providerAgentCatalogModelResolve } from "../../providers/catalog/providerAgentCatalogModelResolve.js"
import type { CodelineExecution } from "../../providers/schema/codelineExecutionSchema.js"
import type { ProviderCatalog } from "../../providers/schema/providerCatalogSchema.js"

export async function sessionModelDefaultResolve(
  database: DatabaseClient,
  input: { agentId: string; modelId: string; serverId: string },
  catalog?: ProviderCatalog,
): Promise<Result<CodelineExecution>> {
  const op = "sessionModelDefaultResolve"
  if (catalog === undefined) return createResultError(op, "The session model catalog is unavailable.")
  const agent = catalog.agents.find(({ id }) => id === input.agentId)
  if (agent === undefined) return createResultError(op, "The session model agent is unavailable in the catalog.")

  const separator = input.modelId.indexOf("/")
  const provider = separator < 0 ? agent.provider : input.modelId.slice(0, separator)
  const model = separator < 0 ? input.modelId : input.modelId.slice(separator + 1)
  if (model.length === 0 || model.includes("/")) return createResultError(op, "The session model is invalid.")
  const selected = providerAgentCatalogModelResolve(catalog, { ...agent, model, provider })
  if (!selected.success) return createResultError(op, `The session model is invalid: ${selected.errorMessage}`)
  if (selected.data.provider.id !== "cliproxyapi" && selected.data.provider.id !== "codex-lb")
    return createResultError(op, "The session model provider is unsupported.")

  const [configured] = await database
    .select({ configuration: agentTable.configuration })
    .from(agentTable)
    .where(and(eq(agentTable.id, input.agentId), eq(agentTable.serverId, input.serverId)))
    .limit(1)
  const projectConfiguration =
    configured === undefined ? providerAgentCatalogConfigurationResolve(catalog, input.agentId) : undefined
  if (projectConfiguration !== undefined && !projectConfiguration.success) return projectConfiguration
  const execution: CodelineExecution = {
    agentId: input.agentId,
    model: selected.data.model.id,
    provider: selected.data.provider.id,
  }
  const resolved = providerAgentCatalogExecutionResolve(
    catalog,
    input.agentId,
    configured?.configuration ?? projectConfiguration?.data,
    execution,
  )
  if (!resolved.success) return createResultError(op, `The session model is invalid: ${resolved.errorMessage}`)
  return createResult(execution)
}

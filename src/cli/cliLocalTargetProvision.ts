import { createResult, createResultError } from "@adaptive-ds/result"
import { agentTable } from "../agents/db/agentTable.js"
import type { DatabaseClient } from "../database/databaseClient.js"
import { databaseTransactionRun } from "../database/databaseTransactionRun.js"
import { providerAgentCatalogConfigurationCompile } from "../providers/catalog/providerAgentCatalogConfigurationCompile.js"
import type { ProviderCatalog } from "../providers/schema/providerCatalogSchema.js"
import { serverTable } from "../servers/db/serverTable.js"

// Reconcile only the local target; never seed example sessions or invent a provider credential.
export async function cliLocalTargetProvision(
  database: DatabaseClient,
  catalog: ProviderCatalog,
  environment: NodeJS.ProcessEnv,
) {
  const op = "cliLocalTargetProvision"
  const serverId = "local:server"
  const available = catalog.agents
    .filter((agent) => agent.enabled && (agent.mode ?? "subagent") === "primary")
    .map((agent) => ({ agent, compiled: providerAgentCatalogConfigurationCompile({ ...catalog, agents: [agent] }) }))
    .find(({ compiled }) => {
      if (!compiled.success) return false
      const configuration = compiled.data[0]?.configuration
      if (configuration === undefined || configuration.provider === "deterministic") return false
      if (!configuration.modelMetadata?.enabled) return false
      if (!catalog.providers.find((provider) => provider.id === configuration.provider)?.enabled) return false
      const credential = configuration.apiKey.slice(1)
      return typeof environment[credential] === "string" && environment[credential]!.length > 0
    })
  if (available === undefined || !available.compiled.success) return createResult({ serverId, agentId: undefined })
  const configuration = available.compiled.data[0]?.configuration
  if (configuration === undefined) return createResultError(op, "The local catalog agent could not be compiled.")
  // Catalog resolution and execution selection use the persisted primary agent ID verbatim.
  const agentId = available.agent.id
  return databaseTransactionRun(database, async (transaction) => {
    try {
      await transaction
        .insert(serverTable)
        .values({ id: serverId, organizationId: "local:organization", name: "Local", endpoint: "in-process" })
        .onConflictDoNothing({ target: serverTable.id })
      await transaction
        .insert(agentTable)
        .values({ id: agentId, serverId, name: available.agent.id, role: "primary", configuration })
        .onConflictDoUpdate({ target: agentTable.id, set: { configuration, updatedAt: new Date() } })
      return createResult({ serverId, agentId, configuration })
    } catch {
      return createResultError(op, "The local catalog target could not be provisioned.")
    }
  })
}

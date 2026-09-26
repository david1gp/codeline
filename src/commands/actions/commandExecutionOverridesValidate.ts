import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import * as v from "valibot"
import { agentConfigurationExecutionResolve } from "../../agents/actions/agentConfigurationExecutionResolve.js"
import { agentTable } from "../../agents/db/agentTable.js"
import { type AgentConfiguration, agentConfigurationSchema } from "../../agents/schema/agentConfigurationSchema.js"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { providerAgentCatalogExecutionResolve } from "../../providers/catalog/providerAgentCatalogExecutionResolve.js"
import { type CodelineExecution, codelineExecutionSchema } from "../../providers/schema/codelineExecutionSchema.js"
import type { ProviderCatalog } from "../../providers/schema/providerCatalogSchema.js"
import type { CommandExecutionOverride } from "../schema/commandExecutionOverrideSchema.js"
import { commandExecutionOverrideSchema } from "../schema/commandExecutionOverrideSchema.js"

export type CommandExecutionOverridesValidation = {
  agentId: string
  execution?: CodelineExecution
  overrides: CommandExecutionOverride
}

function commandModelReferenceResolve(
  modelReference: string,
  defaultProvider: AgentConfiguration["provider"],
): Result<{ model: string; provider: CodelineExecution["provider"] }> {
  const parts = modelReference.split("/")
  const provider = parts.length === 1 ? defaultProvider : parts[0]
  const model = parts.length === 1 ? parts[0] : parts.slice(1).join("/")
  if (
    (provider !== "cliproxyapi" && provider !== "codex-lb" && provider !== "deterministic") ||
    model === undefined ||
    model.length === 0 ||
    parts.length > 2
  )
    return createResultError("commandExecutionOverridesValidate", "The command model override is invalid.")
  return createResult({ model, provider })
}

export async function commandExecutionOverridesValidate(
  database: DatabaseExecutor,
  input: {
    overrides: unknown
    primaryAgentId: string
    serverId: string
  },
  options: { allowAgentOverride?: boolean; catalog?: ProviderCatalog; configuration?: unknown } = {},
): Promise<Result<CommandExecutionOverridesValidation>> {
  const op = "commandExecutionOverridesValidate"
  const parsed = v.safeParse(commandExecutionOverrideSchema, input.overrides)
  if (!parsed.success) return createResultError(op, "The command execution overrides are invalid.")
  const agentId = parsed.output.agent ?? input.primaryAgentId
  if (
    parsed.output.agent !== undefined &&
    parsed.output.agent !== input.primaryAgentId &&
    options.allowAgentOverride !== true
  )
    return createResultError(op, "The command agent override does not match the session primary agent.")

  let configuration: AgentConfiguration
  if (options.configuration !== undefined) {
    const parsedConfiguration = v.safeParse(agentConfigurationSchema, options.configuration)
    if (!parsedConfiguration.success) return createResultError(op, "The session agent configuration is invalid.")
    configuration = parsedConfiguration.output
  } else {
    const [agent] = await database
      .select({ configuration: agentTable.configuration })
      .from(agentTable)
      .where(and(eq(agentTable.id, agentId), eq(agentTable.serverId, input.serverId)))
      .limit(1)
    if (agent === undefined) return createResultError(op, "The command session agent could not be found.")
    const parsedConfiguration = v.safeParse(agentConfigurationSchema, agent.configuration)
    if (!parsedConfiguration.success) return createResultError(op, "The session agent configuration is invalid.")
    configuration = parsedConfiguration.output
  }

  // Agents can also exist only in the database, for example the checked-in deterministic
  // simulation agents. The catalog therefore constrains the agents it owns and stays
  // silent about the rest; existence of those is already proven by the agent lookup above.
  const catalogAgent = options.catalog?.agents.find(({ id }) => id === agentId)
  if (catalogAgent !== undefined && !catalogAgent.enabled)
    return createResultError(op, "The command session agent is disabled in the catalog.")

  if (parsed.output.model === undefined) return createResult({ agentId, overrides: parsed.output })
  const model = commandModelReferenceResolve(parsed.output.model, configuration.provider)
  if (!model.success) return model
  const execution = {
    agentId,
    model: model.data.model,
    provider: model.data.provider,
  }
  const parsedExecution = v.safeParse(codelineExecutionSchema, execution)
  if (!parsedExecution.success) return createResultError(op, "The command model override is invalid.")

  const resolved =
    options.catalog?.agents.some(({ id }) => id === agentId) === true
      ? providerAgentCatalogExecutionResolve(options.catalog!, agentId, configuration, parsedExecution.output)
      : agentConfigurationExecutionResolve(configuration, parsedExecution.output, agentId)
  if (!resolved.success) return createResultError(op, resolved.errorMessage)
  return createResult({ agentId, execution: parsedExecution.output, overrides: parsed.output })
}

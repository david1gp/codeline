import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { agentConfigurationSchema, type AgentConfiguration } from "../../agents/schema/agentConfigurationSchema.js"
import { codelineExecutionSchema } from "../schema/codelineExecutionSchema.js"
import type { ProviderCatalog } from "../schema/providerCatalogSchema.js"
import { providerAgentCatalogConfigurationCompile } from "./providerAgentCatalogConfigurationCompile.js"
import { providerAgentCatalogModelResolve } from "./providerAgentCatalogModelResolve.js"

type ProviderAgentCatalogExecutionResolution = {
  agent: ProviderCatalog["agents"][number]
  configuration: AgentConfiguration
  modelMetadata: ProviderCatalog["providers"][number]["models"][number]
  prompt: string
}

const executableTransports = new Set(["openai/completions", "openai/responses"])

function catalogAgentFind(catalog: ProviderCatalog, agentId: string): ProviderCatalog["agents"][number] | undefined {
  return catalog.agents.find((agent) => agent.id === agentId)
}

function catalogAgentSelectionResolve(
  agent: ProviderCatalog["agents"][number],
  override: v.InferOutput<typeof codelineExecutionSchema> | undefined,
): ProviderCatalog["agents"][number] {
  if (override === undefined) return agent

  return {
    ...agent,
    model: override.model,
    provider: override.provider,
    ...(override.reasoningEffort === undefined
      ? {}
      : {
          effort: override.reasoningEffort,
          generation: { reasoningEffort: override.reasoningEffort },
          variant: override.reasoningEffort,
        }),
  }
}

export function providerAgentCatalogExecutionResolve(
  catalog: ProviderCatalog,
  agentId: string,
  configuration: unknown,
  override?: unknown,
): Result<ProviderAgentCatalogExecutionResolution> {
  const op = "providerAgentCatalogExecutionResolve"
  const parsedConfiguration = v.safeParse(agentConfigurationSchema, configuration)
  if (!parsedConfiguration.success) return createResultError(op, "The agent provider configuration is invalid.")

  const agent = catalogAgentFind(catalog, agentId)
  if (agent === undefined) return createResultError(op, "The catalog agent is unavailable.")
  if (!agent.enabled) return createResultError(op, "The catalog agent is disabled.")

  let parsedOverride: v.InferOutput<typeof codelineExecutionSchema> | undefined
  if (override !== undefined) {
    const parsed = v.safeParse(codelineExecutionSchema, override)
    if (!parsed.success) return createResultError(op, "The codeline execution override is invalid.")
    if (parsed.output.agentId !== undefined && parsed.output.agentId !== agentId)
      return createResultError(op, "The codeline execution override agent does not match the session agent.")
    parsedOverride = parsed.output
  }

  const selectedAgent = catalogAgentSelectionResolve(agent, parsedOverride)
  const resolvedModel = providerAgentCatalogModelResolve(catalog, selectedAgent)
  if (!resolvedModel.success) return createResultError(op, resolvedModel.errorMessage)
  if (!resolvedModel.data.provider.enabled) return createResultError(op, "The selected catalog provider is disabled.")
  if (!resolvedModel.data.model.enabled || !executableTransports.has(resolvedModel.data.model.connection.transport))
    return createResultError(op, "The selected catalog model is disabled or unsupported.")
  if (resolvedModel.data.variant?.effort === "minimal")
    return createResultError(op, "The selected catalog effort variant is unsupported.")

  const compiled = providerAgentCatalogConfigurationCompile({ ...catalog, agents: [selectedAgent] })
  if (!compiled.success) return createResultError(op, compiled.errorMessage)
  const compiledAgent = compiled.data[0]
  if (compiledAgent === undefined) return createResultError(op, "The selected catalog agent could not be compiled.")

  return createResult({
    agent,
    configuration: compiledAgent.configuration,
    modelMetadata: resolvedModel.data.model,
    prompt: agent.prompt,
  })
}

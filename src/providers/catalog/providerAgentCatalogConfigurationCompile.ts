import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { type AgentConfiguration, agentConfigurationSchema } from "../../agents/schema/agentConfigurationSchema.js"
import type { ProviderCatalog } from "../schema/providerCatalogSchema.js"
import { providerAgentCatalogModelResolve } from "./providerAgentCatalogModelResolve.js"

type CatalogAgent = ProviderCatalog["agents"][number]

type ProviderAgentCatalogConfiguration = {
  agent: CatalogAgent
  configuration: AgentConfiguration
}

function agentModeResolve(agent: CatalogAgent): "primary" | "subagent" {
  return agent.mode ?? "subagent"
}

function generationResolve(effort: CatalogAgent["generation"]): AgentConfiguration["generation"] {
  if (effort === undefined) return undefined
  if (effort.reasoningEffort === undefined) return undefined
  return { reasoningEffort: effort.reasoningEffort }
}

function providerGenerationResolve(options: Record<string, unknown>): AgentConfiguration["generation"] {
  const reasoningEffort = options.reasoningEffort
  if (
    reasoningEffort !== "low" &&
    reasoningEffort !== "medium" &&
    reasoningEffort !== "high" &&
    reasoningEffort !== "xhigh" &&
    reasoningEffort !== "max"
  ) {
    return undefined
  }
  return { reasoningEffort }
}

export function providerAgentCatalogConfigurationCompile(
  catalog: ProviderCatalog,
): Result<ProviderAgentCatalogConfiguration[]> {
  const configurations: ProviderAgentCatalogConfiguration[] = []
  for (const agent of catalog.agents) {
    const resolved = providerAgentCatalogModelResolve(catalog, agent)
    if (!resolved.success) return createResultError("providerAgentCatalogConfigurationCompile", resolved.errorMessage)

    const mode = agentModeResolve(agent)
    const generation = generationResolve(agent.generation)
    const variant = resolved.data.variant
    const variantGeneration = variant?.effort === undefined ? undefined : { reasoningEffort: variant.effort }
    const modelOptions = {
      ...resolved.data.model.options,
      ...(variant?.options ?? {}),
    }
    const providerOptions = resolved.data.provider.connection.options
    const compiledGeneration = variantGeneration ?? generation ?? providerGenerationResolve(providerOptions)
    const connection = resolved.data.model.connection
    if (connection.baseUrl === undefined || connection.apiKey === undefined) {
      return createResultError(
        "providerAgentCatalogConfigurationCompile",
        "The selected catalog model has no executable provider connection.",
      )
    }
    if (resolved.data.provider.id !== "cliproxyapi" && resolved.data.provider.id !== "codex-lb") {
      return createResultError(
        "providerAgentCatalogConfigurationCompile",
        "The selected catalog model has an unsupported provider.",
      )
    }

    const sharedConfiguration = {
      baseUrl: connection.baseUrl,
      catalogAgent: {
        ...(agent.description === undefined ? {} : { description: agent.description }),
        enabled: agent.enabled,
        id: agent.id,
        mode,
      },
      catalogRevision: catalog.revision,
      ...(compiledGeneration === undefined ? {} : { generation: compiledGeneration }),
      model: resolved.data.model.id,
      modelMetadata: resolved.data.model,
      modelOptions,
      providerOptions,
      tools: agent.tools,
      ...(variant === undefined ? {} : { variant: variant.id }),
    }
    const configuration =
      resolved.data.provider.id === "cliproxyapi"
        ? {
            ...sharedConfiguration,
            apiKey: connection.apiKey,
            provider: "cliproxyapi" as const,
          }
        : {
            ...sharedConfiguration,
            apiKey: connection.apiKey,
            provider: "codex-lb" as const,
          }
    const validatedConfiguration = v.safeParse(agentConfigurationSchema, configuration)
    if (!validatedConfiguration.success) {
      return createResultError(
        "providerAgentCatalogConfigurationCompile",
        "The compiled catalog configuration is invalid.",
      )
    }
    configurations.push({ agent, configuration: validatedConfiguration.output })
  }

  return createResult(configurations)
}

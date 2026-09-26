import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { type AgentConfiguration, agentConfigurationSchema } from "../../agents/schema/agentConfigurationSchema.js"
import { type ProviderModelDiscoveryOptions, providerModelDiscovery } from "./providerModelDiscovery.js"

export type ProviderConnectionTestResult = {
  readonly discoveredModelCount: number
  readonly model: string
  readonly modelAvailable: boolean
  readonly ok: boolean
  readonly provider: AgentConfiguration["provider"]
}

export async function providerConnectionTest(
  configuration: unknown,
  options: ProviderModelDiscoveryOptions,
): Promise<Result<ProviderConnectionTestResult>> {
  const op = "providerConnectionTest"
  const parsed = v.safeParse(agentConfigurationSchema, configuration)
  if (!parsed.success) return createResultError(op, "The provider configuration is invalid.")

  const discovered = await providerModelDiscovery(parsed.output, options)
  if (!discovered.success) return createResultError(op, discovered.errorMessage)

  const modelAvailable = discovered.data.some((model) => model.id === parsed.output.model)
  return createResult({
    discoveredModelCount: discovered.data.length,
    model: parsed.output.model,
    modelAvailable,
    ok: modelAvailable,
    provider: parsed.output.provider,
  })
}

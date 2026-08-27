import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { agentConfigurationSchema } from "../../agents/schema/agentConfigurationSchema.js"
import { agentInstructionsForPathResolve } from "../../instructions/actions/agentInstructionsForPathResolve.js"
import type { CliProxyApiAdapter } from "./cliProxyApiAdapterCreate.js"
import type { ProviderInstructionContext } from "./providerInstructionContext.js"
import { providerRuntimeAdapterCreate } from "./providerRuntimeAdapterCreate.js"

function providerRuntimeSystemPromptResolve(
  systemPrompt: string | undefined,
  instructionContext: ProviderInstructionContext | undefined,
): Result<string | undefined> {
  const op = "providerRuntimeAdapterResolve"
  if (instructionContext === undefined) return createResult(systemPrompt)

  const instructions = agentInstructionsForPathResolve({
    projectRoot: instructionContext.projectRoot,
    snapshot: instructionContext.snapshot,
    workingDirectory: instructionContext.projectRoot,
  })
  if (!instructions.success) return createResultError(op, "The agent instruction context is invalid.")

  const prompts = [systemPrompt, instructions.data.baseline].filter(
    (prompt): prompt is string => prompt !== undefined && prompt.trim().length > 0,
  )
  return createResult(prompts.length === 0 ? undefined : prompts.join("\n\n"))
}

export function providerRuntimeAdapterResolve(
  configuration: unknown,
  options: {
    environment: Readonly<Record<string, string | undefined>>
    fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    runtimeAdapterCreate?: typeof providerRuntimeAdapterCreate
    instructionContext?: ProviderInstructionContext
    systemPrompt?: string
  },
): Result<CliProxyApiAdapter> {
  const op = "providerRuntimeAdapterResolve"
  const parsed = v.safeParse(agentConfigurationSchema, configuration)
  if (!parsed.success) return createResultError(op, "The agent provider configuration is invalid.")

  const runtimeAdapterCreate = options.runtimeAdapterCreate ?? providerRuntimeAdapterCreate
  const useDefaultRuntimeFetch = runtimeAdapterCreate === providerRuntimeAdapterCreate
  const systemPrompt = providerRuntimeSystemPromptResolve(options.systemPrompt, options.instructionContext)
  if (!systemPrompt.success) return systemPrompt
  return createResult(
    runtimeAdapterCreate({
      configuration: parsed.output,
      environment: options.environment,
      ...(options.fetch === undefined && !useDefaultRuntimeFetch ? {} : { fetch: options.fetch ?? globalThis.fetch }),
      ...(systemPrompt.data === undefined ? {} : { systemPrompt: systemPrompt.data }),
    }),
  )
}

import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { agentConfigurationSchema } from "../../agents/schema/agentConfigurationSchema.js"
import type { CliProxyApiAdapter } from "./cliProxyApiAdapterCreate.js"
import { providerRuntimeAdapterCreate } from "./providerRuntimeAdapterCreate.js"

export function providerRuntimeAdapterResolve(
  configuration: unknown,
  options: {
    environment: Readonly<Record<string, string | undefined>>
    fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    runtimeAdapterCreate?: typeof providerRuntimeAdapterCreate
  },
): Result<CliProxyApiAdapter> {
  const op = "providerRuntimeAdapterResolve"
  const parsed = v.safeParse(agentConfigurationSchema, configuration)
  if (!parsed.success) return createResultError(op, "The agent provider configuration is invalid.")

  const runtimeAdapterCreate = options.runtimeAdapterCreate ?? providerRuntimeAdapterCreate
  const useDefaultRuntimeFetch = runtimeAdapterCreate === providerRuntimeAdapterCreate
  return createResult(
    runtimeAdapterCreate({
      configuration: parsed.output,
      environment: options.environment,
      ...(options.fetch === undefined && !useDefaultRuntimeFetch ? {} : { fetch: options.fetch ?? globalThis.fetch }),
    }),
  )
}

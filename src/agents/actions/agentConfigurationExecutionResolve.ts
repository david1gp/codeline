import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { codelineExecutionSchema } from "../../providers/schema/codelineExecutionSchema.js"
import { type AgentConfiguration, agentConfigurationSchema } from "../schema/agentConfigurationSchema.js"

export function agentConfigurationExecutionResolve(
  configuration: unknown,
  override?: unknown,
  expectedAgentId?: string,
): Result<AgentConfiguration> {
  const op = "agentConfigurationExecutionResolve"
  const parsedConfiguration = v.safeParse(agentConfigurationSchema, configuration)
  if (!parsedConfiguration.success) return createResultError(op, "The agent provider configuration is invalid.")
  if (override === undefined) return createResult(parsedConfiguration.output)

  const parsedOverride = v.safeParse(codelineExecutionSchema, override)
  if (!parsedOverride.success) return createResultError(op, "The codeline execution override is invalid.")
  if (
    expectedAgentId !== undefined &&
    parsedOverride.output.agentId !== undefined &&
    parsedOverride.output.agentId !== expectedAgentId
  ) {
    return createResultError(op, "The codeline execution override agent does not match the session agent.")
  }
  if (parsedOverride.output.provider !== parsedConfiguration.output.provider) {
    return createResultError(op, "The codeline execution override provider must match the agent provider.")
  }

  const resolved = v.safeParse(agentConfigurationSchema, {
    ...parsedConfiguration.output,
    model: parsedOverride.output.model,
    ...(parsedOverride.output.reasoningEffort === undefined
      ? {}
      : {
          generation: {
            ...parsedConfiguration.output.generation,
            reasoningEffort: parsedOverride.output.reasoningEffort,
          },
        }),
  })
  if (!resolved.success) return createResultError(op, "The resolved agent provider configuration is invalid.")
  return createResult(resolved.output)
}

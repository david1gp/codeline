import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { codelineExecutionSchema } from "../../providers/schema/codelineExecutionSchema.js"
import { type AgentConfiguration, agentConfigurationSchema } from "../schema/agentConfigurationSchema.js"

export function agentConfigurationExecutionResolve(
  configuration: unknown,
  override?: unknown,
): Result<AgentConfiguration> {
  const op = "agentConfigurationExecutionResolve"
  const parsedConfiguration = v.safeParse(agentConfigurationSchema, configuration)
  if (!parsedConfiguration.success) return createResultError(op, "The agent provider configuration is invalid.")
  if (override === undefined) return createResult(parsedConfiguration.output)

  const parsedOverride = v.safeParse(codelineExecutionSchema, override)
  if (!parsedOverride.success) return createResultError(op, "The codeline execution override is invalid.")
  if (parsedOverride.output.provider !== parsedConfiguration.output.provider) {
    return createResultError(op, "The codeline execution override provider must match the agent provider.")
  }

  const resolved = v.safeParse(agentConfigurationSchema, {
    ...parsedConfiguration.output,
    model: parsedOverride.output.model,
  })
  if (!resolved.success) return createResultError(op, "The resolved agent provider configuration is invalid.")
  return createResult(resolved.output)
}

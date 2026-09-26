import { createResult, createResultErrorCode, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { agentToolDefaultsSchema } from "../../agents/schema/agentToolDefaultsSchema.js"
import { sessionExecutionSelectionErrorCodes } from "../errors/sessionExecutionSelectionErrorCodes.js"
import {
  type SessionExecutionSelection,
  sessionExecutionSelectionSchema,
} from "../schema/sessionExecutionSelectionSchema.js"

type SessionExecutionSelectionAgentDefault = {
  agentId: string
  enabled?: boolean
  mode?: "primary" | "subagent"
  tools: unknown
}

function toolsResolve(value: unknown): v.InferOutput<typeof agentToolDefaultsSchema> {
  const parsed = v.safeParse(agentToolDefaultsSchema, value)
  return parsed.success ? parsed.output : { bash: false, webfetch: false }
}

export function sessionExecutionSelectionAgentDefaultsResolve(
  primaryAgentId: string,
  agents: readonly SessionExecutionSelectionAgentDefault[],
): Result<SessionExecutionSelection> {
  const primary = agents.find(({ agentId }) => agentId === primaryAgentId)
  const selectableSubagents = agents
    .filter(({ agentId, enabled, mode }) => agentId !== primaryAgentId && enabled !== false && mode !== "primary")
    .map(({ agentId, tools }) => ({ agentId, tools: toolsResolve(tools) }))
  const parsed = v.safeParse(sessionExecutionSelectionSchema, {
    tools: {
      primary: {
        agentId: primaryAgentId,
        tools: toolsResolve(primary?.tools),
      },
      selectableSubagents,
    },
    version: 1,
  })
  if (!parsed.success)
    return createResultErrorCode(
      "sessionExecutionSelectionAgentDefaultsResolve",
      "The agent execution defaults are invalid.",
      sessionExecutionSelectionErrorCodes.agentDefaultsInvalid,
    )
  return createResult(parsed.output)
}

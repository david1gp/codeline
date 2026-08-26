import { createResult, createResultErrorCode, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import type { ProviderCatalog } from "../../providers/schema/providerCatalogSchema.js"
import { sessionExecutionSelectionErrorCodes } from "../errors/sessionExecutionSelectionErrorCodes.js"
import {
  type SessionExecutionSelection,
  sessionExecutionSelectionSchema,
} from "../schema/sessionExecutionSelectionSchema.js"

function sessionExecutionSelectionCatalogValidate(
  selection: SessionExecutionSelection,
  primaryAgentId: string,
  catalog: ProviderCatalog,
): Result<void> {
  const primary = catalog.agents.find(({ id }) => id === primaryAgentId)
  if (primary === undefined)
    return createResultErrorCode(
      "sessionExecutionSelectionCanonicalize",
      "The session execution selection primary agent is unavailable in the provider catalog.",
      sessionExecutionSelectionErrorCodes.primaryAgentUnavailable,
    )
  if (!primary.enabled)
    return createResultErrorCode(
      "sessionExecutionSelectionCanonicalize",
      "The session execution selection primary agent is disabled in the provider catalog.",
      sessionExecutionSelectionErrorCodes.primaryAgentDisabled,
    )

  for (const selected of selection.tools.selectableSubagents) {
    const agent = catalog.agents.find(({ id }) => id === selected.agentId)
    if (agent === undefined)
      return createResultErrorCode(
        "sessionExecutionSelectionCanonicalize",
        "The session execution selection references an unavailable subagent in the provider catalog.",
        sessionExecutionSelectionErrorCodes.subagentUnavailable,
      )
    if (!agent.enabled)
      return createResultErrorCode(
        "sessionExecutionSelectionCanonicalize",
        "The session execution selection references a disabled subagent in the provider catalog.",
        sessionExecutionSelectionErrorCodes.subagentDisabled,
      )
    if (agent.mode === "primary")
      return createResultErrorCode(
        "sessionExecutionSelectionCanonicalize",
        "The session execution selection references a primary-only agent as a subagent.",
        sessionExecutionSelectionErrorCodes.primaryOnlySubagent,
      )
  }
  return createResult(undefined)
}

export function sessionExecutionSelectionCanonicalize(
  input: unknown,
  primaryAgentId: string,
  options: { catalog?: ProviderCatalog } = {},
): Result<SessionExecutionSelection | null> {
  const op = "sessionExecutionSelectionCanonicalize"
  if (input === undefined || input === null) return createResult(null)

  const parsed = v.safeParse(sessionExecutionSelectionSchema, input)
  if (!parsed.success)
    return createResultErrorCode(
      op,
      "The session execution selection is invalid.",
      sessionExecutionSelectionErrorCodes.selectionInvalid,
    )
  if (parsed.output.tools.primary.agentId !== primaryAgentId)
    return createResultErrorCode(
      op,
      "The session execution selection primary agent does not match the session primary agent.",
      sessionExecutionSelectionErrorCodes.primaryAgentMismatch,
    )
  if (options.catalog !== undefined) {
    const catalogValidation = sessionExecutionSelectionCatalogValidate(parsed.output, primaryAgentId, options.catalog)
    if (!catalogValidation.success) return catalogValidation
  }
  return createResult(parsed.output)
}

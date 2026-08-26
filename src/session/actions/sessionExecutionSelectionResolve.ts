import { createResult, createResultErrorCode, type Result } from "@adaptive-ds/result"
import type { ProviderCatalog } from "../../providers/schema/providerCatalogSchema.js"
import { sessionExecutionSelectionErrorCodes } from "../errors/sessionExecutionSelectionErrorCodes.js"
import type { SessionExecutionSelection } from "../schema/sessionExecutionSelectionSchema.js"
import { sessionExecutionSelectionCanonicalize } from "./sessionExecutionSelectionCanonicalize.js"

export function sessionExecutionSelectionResolve(input: {
  agentDefaults?: unknown
  catalog?: ProviderCatalog
  explicit?: unknown
  primaryAgentId: string
  saved?: unknown
}): Result<SessionExecutionSelection> {
  const resolved = input.explicit ??
    input.saved ??
    input.agentDefaults ?? {
      tools: {
        primary: { agentId: input.primaryAgentId, tools: {} },
        selectableSubagents: [],
      },
      version: 1,
    }
  const canonicalized = sessionExecutionSelectionCanonicalize(resolved, input.primaryAgentId, {
    catalog: input.catalog,
  })
  if (!canonicalized.success) return canonicalized
  if (canonicalized.data === null)
    return createResultErrorCode(
      "sessionExecutionSelectionResolve",
      "The resolved execution selection is missing.",
      sessionExecutionSelectionErrorCodes.selectionInvalid,
    )
  return createResult(canonicalized.data)
}

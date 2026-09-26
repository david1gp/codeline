import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { ProviderCatalog } from "../../providers/schema/providerCatalogSchema.js"
import { sessionExecutionSelectionCanonicalize } from "../../session/actions/sessionExecutionSelectionCanonicalize.js"

export function commandSubtaskSelectionValidate(input: {
  catalog?: ProviderCatalog
  primaryAgentId: string
  selection: unknown
  subtaskAgentId: string
}): Result<void> {
  const op = "commandSubtaskSelectionValidate"
  const selection = sessionExecutionSelectionCanonicalize(input.selection, input.primaryAgentId, {
    catalog: input.catalog,
  })
  if (!selection.success) return createResultError(op, selection.errorMessage)
  if (input.subtaskAgentId === input.primaryAgentId) return createResult(undefined)
  if (
    selection.data === null ||
    !selection.data.tools.selectableSubagents.some(({ agentId }) => agentId === input.subtaskAgentId)
  )
    return createResultError(op, "The command subtask agent is not selectable in the session execution selection.")
  return createResult(undefined)
}

import type { RunDelegationsResponse } from "../../run/api/runDelegationsResponseSchema.js"

type BackgroundContinuationDelegation = Pick<
  RunDelegationsResponse["delegations"][number],
  "background" | "childRunId" | "continuationDelivered" | "delegationId" | "finalizedResult" | "task"
>

export type BackgroundContinuationPending = {
  delegationId: string
  message: string
}

const backgroundContinuationResultLimit = 4_000

function backgroundContinuationResultText(
  delegation: BackgroundContinuationDelegation,
): { status: string; text: string } | undefined {
  const result = delegation.finalizedResult
  if (result === null) return undefined
  if (result.status === "succeeded") {
    return { status: "completed", text: result.text }
  }
  if (result.status === "failed") {
    return { status: "failed", text: result.failure.message }
  }
  return undefined
}

export function backgroundContinuationMessageCreate(delegation: BackgroundContinuationDelegation): string | undefined {
  const result = backgroundContinuationResultText(delegation)
  if (result === undefined) return undefined
  const task = delegation.task.trim().slice(0, 500)
  const body =
    result.text.length > backgroundContinuationResultLimit
      ? `${result.text.slice(0, backgroundContinuationResultLimit)}\n…[truncated ${result.text.length - backgroundContinuationResultLimit} chars; see the subagent thread for the full result]`
      : result.text
  return [
    `Background task ${result.status} (delegation ${delegation.delegationId}, child run ${delegation.childRunId}): ${task}`,
    body.length === 0 ? "(no result text)" : body,
    "Incorporate this result into the session and continue.",
  ].join("\n\n")
}

/**
 * Selects the next background delegation result awaiting parent delivery.
 * Foreground delegations resolve inline into the running parent turn, and
 * already-acknowledged ones stay silent, so only unacknowledged finalized
 * background results (success or failure) trigger an automatic continuation.
 */
export function backgroundContinuationSelect(
  delegations: ReadonlyArray<BackgroundContinuationDelegation>,
): BackgroundContinuationPending | undefined {
  for (const delegation of delegations) {
    if (!delegation.background || delegation.continuationDelivered) continue
    const message = backgroundContinuationMessageCreate(delegation)
    if (message === undefined) continue
    return { delegationId: delegation.delegationId, message }
  }
  return undefined
}

import { sessionStreamDelegationResolve } from "./sessionStreamDelegationResolve.js"
import type {
  SessionStreamDelegation,
  SessionStreamDelegationLink,
  SessionStreamEntry,
  SessionStreamGroup,
} from "./sessionStreamGroupsDerive.js"
import { sessionStreamDelegationLinkResolve } from "./sessionStreamGroupsDerive.js"
import type { TransientActivity } from "./transientMessageActivitiesResolve.js"

type SessionStreamInFlightMessage = {
  activities?: ReadonlyArray<TransientActivity>
  content: string
  id?: string
  role: string
}

function inFlightEntryKind(activity: TransientActivity): SessionStreamEntry["kind"] {
  return activity.kind === "thinking" ? "thinking" : "tool"
}

function inFlightDelegationResolve(
  activity: TransientActivity,
  delegations: ReadonlyArray<SessionStreamDelegation>,
  scope: { parentAttemptId?: string; parentRunId: string } | undefined,
  runs: ReadonlyArray<{
    attempts?: ReadonlyArray<{ streamId: string }>
    id: string
    snapshot?: unknown
    streamId?: string
  }>,
): SessionStreamDelegationLink | undefined {
  if (
    activity.kind !== "tool-call" ||
    activity.label !== "delegate_task" ||
    activity.toolCallId === undefined ||
    scope === undefined
  )
    return undefined
  const delegation = sessionStreamDelegationResolve({ activity, delegations, runs, scope })
  return delegation === undefined ? undefined : sessionStreamDelegationLinkResolve(delegation, runs)
}

/**
 * Project the still-streaming assistant turn onto the same entry shape the
 * persisted stream groups use, so stream mode shows live thinking and tool
 * activity next to durable events without duplicating chat composer state.
 */
export function sessionStreamInFlightDerive(
  messages: ReadonlyArray<SessionStreamInFlightMessage>,
  delegations: ReadonlyArray<SessionStreamDelegation> = [],
  scope?: { parentAttemptId?: string; parentRunId: string },
  runs: ReadonlyArray<{
    attempts?: ReadonlyArray<{ streamId: string }>
    id: string
    snapshot?: unknown
    streamId?: string
  }> = [],
): SessionStreamGroup | undefined {
  const entries: Array<SessionStreamEntry> = []
  for (const [index, message] of messages.entries()) {
    const messageId = message.id ?? String(index)
    for (const activity of message.activities ?? []) {
      const delegation = inFlightDelegationResolve(activity, delegations, scope, runs)
      entries.push({
        ...(activity.detail === undefined ? {} : { detail: activity.detail }),
        ...(delegation === undefined ? {} : { delegation }),
        id: `${messageId}-${activity.id}`,
        kind: inFlightEntryKind(activity),
        label: activity.label,
        ...(activity.status === undefined ? {} : { status: activity.status }),
      })
    }
    if (message.role !== "user" && message.content.length > 0)
      entries.push({ detail: message.content, id: `${messageId}-output`, kind: "output", label: "Output" })
  }
  if (entries.length === 0) return undefined
  return { entries, id: "in-flight", label: "In flight", status: "streaming", streamId: "in-flight" }
}

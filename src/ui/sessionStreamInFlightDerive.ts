import type { SessionStreamEntry, SessionStreamGroup } from "./sessionStreamGroupsDerive.js"
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

/**
 * Project the still-streaming assistant turn onto the same entry shape the
 * persisted stream groups use, so stream mode shows live thinking and tool
 * activity next to durable events without duplicating chat composer state.
 */
export function sessionStreamInFlightDerive(
  messages: ReadonlyArray<SessionStreamInFlightMessage>,
): SessionStreamGroup | undefined {
  const entries: Array<SessionStreamEntry> = []
  for (const [index, message] of messages.entries()) {
    const messageId = message.id ?? String(index)
    for (const activity of message.activities ?? [])
      entries.push({
        ...(activity.detail === undefined ? {} : { detail: activity.detail }),
        id: `${messageId}-${activity.id}`,
        kind: inFlightEntryKind(activity),
        label: activity.label,
        ...(activity.status === undefined ? {} : { status: activity.status }),
      })
    if (message.role !== "user" && message.content.length > 0)
      entries.push({ detail: message.content, id: `${messageId}-output`, kind: "output", label: "Output" })
  }
  if (entries.length === 0) return undefined
  return { entries, id: "in-flight", label: "In flight", status: "streaming", streamId: "in-flight" }
}

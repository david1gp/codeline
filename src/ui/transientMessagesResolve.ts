import type { TransientActivity } from "./transientMessageActivitiesResolve.js"

export type TransientMessage = {
  activities?: ReadonlyArray<TransientActivity>
  content: string
  id: string
  role: "assistant" | "user"
}

type DurableMessage = {
  content: string
  role: string
}

function transientMessageKey(role: string, content: string): string {
  return `${role}\u0000${content.trim()}`
}

/**
 * An in-flight assistant turn holds only the fragments this tab observed, so after
 * authoritative reconciliation it is a prefix of the durable content rather than an
 * exact match. Longer transients are matched first, and exactly before by prefix, so a
 * short partial never claims the durable message another transient matches exactly.
 */
function durableAssistantsSupersede(
  transient: ReadonlyArray<TransientMessage>,
  durable: ReadonlyArray<DurableMessage>,
): ReadonlySet<string> {
  const available = durable.filter((message) => message.role === "assistant").map((message) => message.content.trim())
  const candidates = transient
    .filter((message) => message.role === "assistant" && message.content.trim().length > 0)
    .map((message) => ({ content: message.content.trim(), id: message.id }))
    .sort((left, right) => right.content.length - left.content.length)

  const superseded = new Set<string>()
  for (const matchExact of [true, false]) {
    for (const candidate of candidates) {
      if (superseded.has(candidate.id)) continue
      const index = available.findIndex((durableContent) =>
        matchExact ? durableContent === candidate.content : durableContent.startsWith(candidate.content),
      )
      if (index === -1) continue
      available.splice(index, 1)
      superseded.add(candidate.id)
    }
  }
  return superseded
}

/**
 * Remove in-flight turn entries that a synchronized durable message already
 * covers, so a finalized durable row never renders twice. Matching is per
 * role/content occurrence, so repeating the same prompt keeps the extra
 * transient copy until its own durable row arrives.
 */
export function transientMessagesResolve(
  transient: ReadonlyArray<TransientMessage>,
  durable: ReadonlyArray<DurableMessage>,
): Array<TransientMessage> {
  const durableCounts = new Map<string, number>()
  for (const message of durable) {
    const key = transientMessageKey(message.role, message.content)
    durableCounts.set(key, (durableCounts.get(key) ?? 0) + 1)
  }

  const supersededAssistants = durableAssistantsSupersede(transient, durable)
  const remaining: Array<TransientMessage> = []
  for (const message of transient) {
    if (message.content.trim().length === 0) {
      // A turn that only produced tool or thinking activity still has to render.
      if ((message.activities?.length ?? 0) > 0) remaining.push(message)
      continue
    }
    if (message.role === "assistant") {
      if (!supersededAssistants.has(message.id)) remaining.push(message)
      continue
    }
    const key = transientMessageKey(message.role, message.content)
    const covered = durableCounts.get(key) ?? 0
    if (covered > 0) {
      durableCounts.set(key, covered - 1)
      continue
    }
    remaining.push(message)
  }

  return remaining
}

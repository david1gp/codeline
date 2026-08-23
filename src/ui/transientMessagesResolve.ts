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

  const remaining: Array<TransientMessage> = []
  for (const message of transient) {
    if (message.content.trim().length === 0) {
      // A turn that only produced tool or thinking activity still has to render.
      if ((message.activities?.length ?? 0) > 0) remaining.push(message)
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

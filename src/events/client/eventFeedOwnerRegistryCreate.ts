import { createResult, createResultError, type Result } from "@adaptive-ds/result"

export type EventFeedOwnerLease = {
  release: () => void
}

export type EventFeedOwnerRegistry = {
  acquire: () => Result<EventFeedOwnerLease>
}

export function eventFeedOwnerRegistryCreate(): EventFeedOwnerRegistry {
  let leaseActive = false

  const acquire = (): Result<EventFeedOwnerLease> => {
    const op = "eventFeedOwnerRegistryAcquire"
    if (leaseActive) return createResultError(op, "This tab already has an event feed owner.")
    leaseActive = true
    let released = false
    return createResult({
      release: () => {
        if (released) return
        released = true
        leaseActive = false
      },
    })
  }

  return { acquire }
}

import { sessionViewAcknowledgeRequest } from "../session/client/sessionViewAcknowledgeRequest.js"

type SessionViewAcknowledgeStateOptions = {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  isOnline?: () => boolean
}

export function sessionViewAcknowledgeStateCreate(options: SessionViewAcknowledgeStateOptions = {}) {
  const acknowledged = new Set<string>()
  const pending = new Map<string, { forcePending: boolean }>()

  const acknowledge = (sessionId: string, force = false): void => {
    if (options.isOnline?.() === false) return
    if (!force && acknowledged.has(sessionId)) return

    const current = pending.get(sessionId)
    if (current !== undefined) {
      if (force) current.forcePending = true
      return
    }

    const next = { forcePending: false }
    pending.set(sessionId, next)
    void sessionViewAcknowledgeRequest(sessionId, { fetch: options.fetch })
      .then((result) => {
        if (result.success) acknowledged.add(sessionId)
      })
      .finally(() => {
        if (pending.get(sessionId) !== next) return
        pending.delete(sessionId)
        if (next.forcePending) acknowledge(sessionId, true)
      })
  }

  return {
    acknowledge,
    reset: (sessionId: string) => {
      acknowledged.delete(sessionId)
    },
  }
}

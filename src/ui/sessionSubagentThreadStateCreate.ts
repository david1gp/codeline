import { createEffect } from "solid-js"
import type { SessionStreamDelegationLink } from "./sessionStreamGroupsDerive.js"
import { signalObjectCreate } from "./signalObjectCreate.js"

type SessionSubagentThreadStateOptions = {
  rightPanelClose: () => void
  rightPanelShow: () => void
  sessionId: () => string | null
}

export function sessionSubagentThreadStateCreate(options: SessionSubagentThreadStateOptions) {
  const selected = signalObjectCreate<SessionStreamDelegationLink | undefined>(undefined)
  let previousSessionId = options.sessionId()

  createEffect(() => {
    const currentSessionId = options.sessionId()
    if (currentSessionId === previousSessionId) return
    previousSessionId = currentSessionId
    if (selected.get() === undefined) return
    selected.set(undefined)
    options.rightPanelClose()
  })

  return {
    close: () => {
      selected.set(undefined)
      options.rightPanelClose()
    },
    open: (delegation: SessionStreamDelegationLink) => {
      selected.set(delegation)
      options.rightPanelShow()
    },
    selected: selected.get,
  }
}

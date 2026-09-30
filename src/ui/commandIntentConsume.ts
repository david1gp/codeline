import type { CommandIntent } from "./commandIntent.js"

export function commandIntentConsume(
  intent: CommandIntent | null,
  actions: {
    projectCreateOpen: () => void
    sessionNew: (projectId?: string) => void
  },
): null {
  if (intent === null) return null
  if (intent.kind === "new-project") {
    actions.projectCreateOpen()
    return null
  }
  if (intent.kind === "new-session-project") {
    actions.sessionNew(intent.projectId)
    return null
  }
  actions.sessionNew()
  return null
}

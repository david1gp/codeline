import { createRoot, onCleanup } from "solid-js/dist/solid.js"
import type { Accessor } from "solid-js"
import type { CodelineExecution } from "../providers/schema/codelineExecutionSchema.js"
import type { sessionChatStateCreate, SessionChatState } from "./sessionChatStateCreate.js"

type SessionChatStateCacheOptions = {
  chatStateCreate: typeof sessionChatStateCreate
  codelineExecution: Accessor<CodelineExecution | null>
  durableMessages: () => ReadonlyArray<{ content: string; role: string }>
}

/**
 * Keeps exactly one chat/composer state per selected session. Solid props are
 * getters, so the view reads the chat accessor on every render pass; without
 * this cache each read rebuilt the composer, discarded the draft, and left
 * submission permanently disabled. Selecting another session disposes the
 * previous owner root so its in-flight turn is not leaked.
 */
export function sessionChatStateCacheCreate(options: SessionChatStateCacheOptions) {
  let current: { dispose: () => void; sessionId: string; state: SessionChatState } | undefined

  onCleanup(() => {
    current?.dispose()
    current = undefined
  })

  return (sessionId: string): SessionChatState => {
    const existing = current
    if (existing && existing.sessionId === sessionId) return existing.state
    existing?.dispose()
    current = createRoot((dispose) => ({
      dispose,
      sessionId,
      state: options.chatStateCreate({
        codelineExecution: options.codelineExecution,
        durableMessages: options.durableMessages,
        sessionId,
      }),
    }))
    return current.state
  }
}

import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import type { SessionChatState } from "../sessionChatStateCreate.js"
import type { TransientMessage } from "../transientMessagesResolve.js"
import { transientMessagesResolve } from "../transientMessagesResolve.js"
import type { DemoSessionScreenVariant } from "./demoSessionScreenVariant.js"

const streamingPending: readonly TransientMessage[] = [
  { content: "Summarize the catalog work still outstanding.", id: "demo-pending-user", role: "user" },
  {
    content: "Reviewing the registry now. The workspace screen already renders from injected fixtures...",
    id: "demo-pending-assistant",
    role: "assistant",
  },
]

/**
 * Composer behavior for demo specimens: it echoes the draft locally instead of
 * reaching the chat backend, so the real composer view stays exercised.
 */
export function demoSessionChatStateCreate(variant: () => DemoSessionScreenVariant): SessionChatState {
  const draft = createSignalObject("")
  const sent = createSignalObject<readonly TransientMessage[]>([])
  const isStreaming = () => variant() === "streaming"
  const submit = async () => {
    const prompt = draft.get().trim()
    if (prompt.length === 0) return
    draft.set("")
    sent.set([...sent.get(), { content: prompt, id: `demo-sent-${sent.get().length}`, role: "user" }])
  }

  return {
    attemptCount: () => (isStreaming() ? 1 : 0),
    canSubmit: () => draft.get().trim().length > 0 && !isStreaming(),
    failures: () => [],
    isAborted: () => false,
    isThinking: isStreaming,
    draft: draft.get,
    draftUpdate: draft.set,
    errorMessage: () => (variant() === "error" ? "The deterministic provider rejected the last turn." : undefined),
    isBusy: isStreaming,
    isStopping: () => false,
    keyDownHandle: (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return
      event.preventDefault()
      submit()
    },
    pendingMessages: () =>
      transientMessagesResolve(isStreaming() ? [...streamingPending, ...sent.get()] : sent.get(), []),
    recoveryStatus: () => (isStreaming() ? "streaming" : "idle"),
    stopHandle: () => undefined,
    submit,
    submitHandle: (event: Event) => {
      event.preventDefault()
      submit()
    },
  }
}

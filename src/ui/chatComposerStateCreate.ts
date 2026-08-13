import { fetchServerSentEvents, useChat } from "@tanstack/ai-solid"
import { createMemo, createSignal } from "solid-js"
import type { TransientMessage } from "./transientMessagesResolve.js"

type ChatComposerOptions = {
  sessionId: string
}

function chatMessageText(parts: ReadonlyArray<{ type: string; content?: unknown }>): string {
  let text = ""
  for (const part of parts) {
    if (part.type === "text" && typeof part.content === "string") text += part.content
  }
  return text
}

/**
 * Composer state for one active session. The hook is instantiated per session
 * id (the view keys on it), so navigating sessions discards the in-flight turn
 * instead of leaking it into the next conversation.
 */
export function chatComposerStateCreate(options: ChatComposerOptions) {
  const [draft, setDraft] = createSignal("")
  const chat = useChat({
    connection: fetchServerSentEvents(`/api/sessions/${encodeURIComponent(options.sessionId)}/chat`),
    threadId: options.sessionId,
  })

  const transientMessages = createMemo<Array<TransientMessage>>(() =>
    chat
      .messages()
      .filter((message) => message.role === "assistant" || message.role === "user")
      .map((message) => ({
        content: chatMessageText(message.parts),
        id: message.id,
        role: message.role as "assistant" | "user",
      })),
  )

  const submit = () => {
    const prompt = draft().trim()
    if (prompt.length === 0 || chat.isLoading()) return
    setDraft("")
    void chat.sendMessage(prompt, { whenBusy: "drop" })
  }

  return {
    canSubmit: () => draft().trim().length > 0 && !chat.isLoading(),
    draft,
    errorMessage: () => chat.error()?.message,
    isBusy: chat.isLoading,
    setDraft,
    stop: () => chat.stop(),
    submit,
    transientMessages,
  }
}

export type ChatComposerState = ReturnType<typeof chatComposerStateCreate>

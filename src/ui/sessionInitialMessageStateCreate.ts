import type { Accessor } from "solid-js"
import { createEffect } from "solid-js/dist/solid.js"
import type { SessionChatState } from "./sessionChatStateCreate.js"
import { signalObjectCreate } from "./signalObjectCreate.js"

type SessionInitialMessageStateOptions = {
  chatCreate: (sessionId: string) => SessionChatState
  selectedSessionId: Accessor<string | null>
  sessionCreateStart: (projectPathOverride?: string) => Promise<string | null>
  sessionCreateErrorMessage: () => string | undefined
  sessionReady: (sessionId: string) => Promise<boolean>
  sessionTargetAvailable: () => boolean
}

export function sessionInitialMessageStateCreate(options: SessionInitialMessageStateOptions) {
  const draft = signalObjectCreate("")
  const errorMessage = signalObjectCreate<string | undefined>(undefined)
  const isPending = signalObjectCreate(false)
  let createdSessionId: string | null = null
  let submission: Promise<void> | null = null

  createEffect(() => {
    const selectedSessionId = options.selectedSessionId()
    if (isPending.get() || selectedSessionId === null || selectedSessionId === createdSessionId) return
    createdSessionId = null
    errorMessage.set(undefined)
  })

  const submit = () => {
    if (submission !== null) return submission
    const preservedDraft = draft.get()
    const prompt = preservedDraft.trim()
    if (prompt.length === 0) return Promise.resolve()

    errorMessage.set(undefined)
    isPending.set(true)
    const task = (async () => {
      let sessionId = createdSessionId
      if (sessionId === null) {
        if (!options.sessionTargetAvailable()) throw new Error("Select an available agent before sending.")
        sessionId = await options.sessionCreateStart()
        if (sessionId === null) {
          throw new Error(options.sessionCreateErrorMessage() ?? "The conversation could not be created. Try again.")
        }
        createdSessionId = sessionId
      }

      if (!(await options.sessionReady(sessionId))) {
        throw new Error("The new conversation is not ready yet. Try sending again.")
      }

      const chat = options.chatCreate(sessionId)
      chat.draftUpdate(preservedDraft)
      draft.set("")
      isPending.set(false)
      await chat.submit()
      draft.set("")
      createdSessionId = null
    })()
    submission = task
    void task
      .catch((error: unknown) => {
        draft.set(preservedDraft)
        errorMessage.set(error instanceof Error ? error.message : "The message could not be sent. Try again.")
      })
      .finally(() => {
        isPending.set(false)
        submission = null
      })
    return task
  }

  const chat: SessionChatState = {
    attemptCount: () => 0,
    canSubmit: () => draft.get().trim().length > 0 && submission === null,
    draft: draft.get,
    draftUpdate: (value: string) => {
      if (submission !== null) return
      draft.set(value)
      errorMessage.set(undefined)
    },
    errorMessage: errorMessage.get,
    failures: () => [],
    isAborted: () => false,
    isBusy: () => false,
    isStopping: () => false,
    isThinking: isPending.get,
    keyDownHandle: (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return
      event.preventDefault()
      void submit()
    },
    pendingMessages: () => [],
    recoveryStatus: () => "idle",
    stopHandle: () => undefined,
    submit,
    submitHandle: (event: Event) => {
      event.preventDefault()
      void submit()
    },
  }

  return {
    chat,
    isVisible: () => options.selectedSessionId() === null || isPending.get() || errorMessage.get() !== undefined,
  }
}

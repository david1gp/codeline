import type { Accessor } from "solid-js"
import { createEffect } from "solid-js/dist/solid.js"
import type { CommandInvocation } from "../commands/schema/commandInvocationSchema.js"
import { chatCommandComposerStateCreate } from "./chatCommandComposerStateCreate.js"
import { chatCommandKeyDownHandle } from "./chatCommandKeyDownHandle.js"
import type { ChatCommandCatalogSource, ChatCommandComposerView } from "./chatCommandView.js"
import type { SessionChatState } from "./sessionChatStateCreate.js"
import type { SessionProjectTarget } from "./sessionProjectTarget.js"
import { signalObjectCreate } from "./signalObjectCreate.js"

type SessionInitialMessageStateOptions = {
  chatCreate: (sessionId: string) => SessionChatState
  /** Project command catalog backing slash-command autocomplete before a session exists. */
  commandCatalog?: ChatCommandCatalogSource
  selectedSessionId: Accessor<string | null>
  sessionCreateStart: (
    projectTarget?: SessionProjectTarget,
    command?: { arguments: string; name: string },
  ) => Promise<string | null>
  sessionCreateErrorMessage: () => string | undefined
  sessionReady: (sessionId: string) => Promise<boolean>
  sessionTargetAvailable: () => boolean
}

export function sessionInitialMessageStateCreate(options: SessionInitialMessageStateOptions) {
  const draft = signalObjectCreate("")
  const errorMessage = signalObjectCreate<string | undefined>(undefined)
  const isPending = signalObjectCreate(false)
  let createdSessionId: string | null = null
  let createdChat: SessionChatState | null = null
  let submission: Promise<void> | null = null

  const draftUpdate = (value: string) => {
    if (submission !== null) return
    draft.set(value)
    errorMessage.set(undefined)
    if (createdChat !== null && options.selectedSessionId() === createdSessionId) createdChat.draftUpdate(value)
  }

  const command: ChatCommandComposerView | undefined =
    options.commandCatalog === undefined
      ? undefined
      : chatCommandComposerStateCreate({
          catalog: options.commandCatalog,
          draft: draft.get,
          draftUpdate,
          idPrefix: "initial-command",
        })

  createEffect(() => {
    const selectedSessionId = options.selectedSessionId()
    if (isPending.get() || selectedSessionId === null || selectedSessionId === createdSessionId) return
    createdSessionId = null
    createdChat = null
    errorMessage.set(undefined)
  })

  const submit = () => {
    if (submission !== null) return submission
    const preservedDraft = draft.get()
    const prompt = preservedDraft.trim()
    if (prompt.length === 0) return Promise.resolve()
    // A command draft is validated before any session exists, so a malformed
    // invocation never creates an empty conversation that cannot run it.
    const blocking = command?.errorMessage()
    if (blocking !== undefined) {
      errorMessage.set(blocking)
      return Promise.resolve()
    }
    const invocation: CommandInvocation | undefined = command?.invocation()

    errorMessage.set(undefined)
    isPending.set(true)
    const task = (async () => {
      let sessionId = createdSessionId
      if (sessionId === null) {
        if (!options.sessionTargetAvailable()) throw new Error("Select an available agent before sending.")
        // The command travels with creation so its agent/model/subtask overrides are
        // validated and captured in the immutable session selection and manifest
        // before the session exists, not after the first turn has already started.
        sessionId = await options.sessionCreateStart(undefined, invocation)
        if (sessionId === null) {
          throw new Error(options.sessionCreateErrorMessage() ?? "The conversation could not be created. Try again.")
        }
        createdSessionId = sessionId
      }

      if (!(await options.sessionReady(sessionId))) {
        throw new Error("The new conversation is not ready yet. Try sending again.")
      }

      // The expansion is submitted through the normal chat path of the created
      // session, so command identity and template digest are persisted by the same
      // route that handles every other turn.
      const chat = options.chatCreate(sessionId)
      createdChat = chat
      chat.draftUpdate(invocation === undefined ? preservedDraft : `/${invocation.name} ${invocation.arguments}`.trim())
      draft.set("")
      isPending.set(false)
      await chat.submit()
      draft.set("")
      createdSessionId = null
      createdChat = null
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
    canSubmit: () => draft.get().trim().length > 0 && submission === null && command?.errorMessage() === undefined,
    command,
    draft: draft.get,
    draftUpdate,
    errorMessage: errorMessage.get,
    failures: () => [],
    isAborted: () => false,
    isBusy: () => false,
    isStopping: () => false,
    isThinking: isPending.get,
    keyDownHandle: (event: KeyboardEvent) => {
      if (command !== undefined && chatCommandKeyDownHandle(event, command)) return
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

import type { Accessor } from "solid-js"
import type { CodelineExecution } from "../providers/schema/codelineExecutionSchema.js"
import { chatComposerStateCreate } from "./chatComposerStateCreate.js"
import { transientMessagesResolve } from "./transientMessagesResolve.js"

type SessionChatStateOptions = {
  codelineExecution: Accessor<CodelineExecution | null>
  durableMessages: () => ReadonlyArray<{ content: string; role: string }>
  sessionId: string
}

export function sessionChatStateCreate(options: SessionChatStateOptions) {
  const composer = chatComposerStateCreate({
    codelineExecution: options.codelineExecution,
    sessionId: options.sessionId,
  })

  return {
    attemptCount: composer.activity.attemptCount,
    canSubmit: composer.canSubmit,
    failures: composer.activity.failures,
    isAborted: composer.activity.isAborted,
    isThinking: composer.activity.isThinking,
    draft: composer.draft,
    draftUpdate: composer.setDraft,
    errorMessage: composer.errorMessage,
    isBusy: composer.isBusy,
    isStopping: composer.isStopping,
    keyDownHandle: (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return
      event.preventDefault()
      composer.submit()
    },
    pendingMessages: () => transientMessagesResolve(composer.transientMessages(), options.durableMessages()),
    recoveryStatus: composer.recoveryStatus,
    stopHandle: () => void composer.stop(),
    submitHandle: (event: Event) => {
      event.preventDefault()
      composer.submit()
    },
  }
}

export type SessionChatState = ReturnType<typeof sessionChatStateCreate>

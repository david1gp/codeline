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
      void composer.submit().catch(() => undefined)
    },
    pendingMessages: () => transientMessagesResolve(composer.transientMessages(), options.durableMessages()),
    recoveryStatus: composer.recoveryStatus,
    runId: composer.runId,
    stopHandle: () => void composer.stop(),
    submit: () => composer.submit(),
    submitHandle: (event: Event) => {
      event.preventDefault()
      void composer.submit().catch(() => undefined)
    },
  }
}

export type SessionChatState = Omit<ReturnType<typeof sessionChatStateCreate>, "runId"> & {
  runId?: () => string | null
}

import type { Accessor } from "solid-js"
import type { CodelineExecution } from "../providers/schema/codelineExecutionSchema.js"
import { chatCommandComposerStateCreate } from "./chatCommandComposerStateCreate.js"
import { chatCommandKeyDownHandle } from "./chatCommandKeyDownHandle.js"
import type { ChatCommandCatalogSource, ChatCommandComposerView } from "./chatCommandView.js"
import { chatComposerStateCreate } from "./chatComposerStateCreate.js"
import { transientMessagesResolve } from "./transientMessagesResolve.js"

type SessionChatStateOptions = {
  authoritativeReloadVersion?: () => number
  codelineExecution: Accessor<CodelineExecution | null>
  /** Project command catalog backing slash-command autocomplete for this session. */
  commandCatalog?: ChatCommandCatalogSource
  durableMessages: () => ReadonlyArray<{ content: string; role: string }>
  sessionId: string
}

export function sessionChatStateCreate(options: SessionChatStateOptions) {
  let command: ChatCommandComposerView | undefined
  const composer = chatComposerStateCreate({
    ...(options.authoritativeReloadVersion === undefined
      ? {}
      : { authoritativeReloadVersion: options.authoritativeReloadVersion }),
    codelineExecution: options.codelineExecution,
    ...(options.commandCatalog === undefined
      ? {}
      : {
          command: {
            errorMessage: () => command?.errorMessage(),
            invocation: () => command?.invocation(),
          },
        }),
    sessionId: options.sessionId,
  })
  command =
    options.commandCatalog === undefined
      ? undefined
      : chatCommandComposerStateCreate({
          catalog: options.commandCatalog,
          draft: composer.draft,
          draftUpdate: composer.setDraft,
          idPrefix: `session-command-${options.sessionId}`,
        })

  return {
    attemptCount: composer.activity.attemptCount,
    canSubmit: composer.canSubmit,
    command,
    failures: composer.activity.failures,
    isAborted: composer.activity.isAborted,
    isThinking: composer.activity.isThinking,
    draft: composer.draft,
    draftUpdate: composer.setDraft,
    errorMessage: composer.errorMessage,
    isBusy: composer.isBusy,
    isStopping: composer.isStopping,
    keyDownHandle: (event: KeyboardEvent) => {
      if (command !== undefined && chatCommandKeyDownHandle(event, command)) return
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return
      event.preventDefault()
      void composer.submit().catch(() => undefined)
    },
    pendingMessages: () =>
      transientMessagesResolve(composer.transientMessages(), options.durableMessages(), {
        hideManualCompaction: composer.manualCompactionHidden(),
      }),
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

export type SessionChatState = Omit<ReturnType<typeof sessionChatStateCreate>, "command" | "runId"> & {
  /** Slash-command affordance, absent for read-only and fixture composers. */
  command?: ChatCommandComposerView | undefined
  /** Set when the composer is disabled because the session renders read-only from cache. */
  readOnlyNotice?: () => string
  runId?: () => string | null
}

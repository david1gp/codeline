import type { SessionChatState } from "./sessionChatStateCreate.js"

/**
 * Neutralizes every composer mutation while the session renders from the
 * device-local settled cache. Offline and signed-out browsing is read-only: no
 * prompt submission, no cancellation, and no draft capture that could imply a
 * queued send.
 */
export function sessionChatStateReadOnlyWrap(state: SessionChatState, notice: () => string): SessionChatState {
  return {
    ...state,
    canSubmit: () => false,
    draft: () => "",
    draftUpdate: () => undefined,
    errorMessage: () => undefined,
    isBusy: () => false,
    isStopping: () => false,
    keyDownHandle: (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return
      event.preventDefault()
    },
    readOnlyNotice: notice,
    stopHandle: () => undefined,
    submit: async () => undefined,
    submitHandle: (event: Event) => event.preventDefault(),
  }
}

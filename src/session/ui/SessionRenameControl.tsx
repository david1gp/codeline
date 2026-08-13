import { sessionRenameControlStateCreate } from "./sessionRenameControlStateCreate.js"

type SessionRenameControlProps = {
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  onRenamed?: (title: string) => void
  sessionId: string
  title: string
}

export function SessionRenameControl(props: SessionRenameControlProps) {
  const inputId = `session-rename-title-${encodeURIComponent(props.sessionId)}`
  const errorId = `session-rename-error-${encodeURIComponent(props.sessionId)}`
  const state = sessionRenameControlStateCreate({
    fetcher: props.fetcher,
    onRenamed: props.onRenamed,
    sessionId: () => props.sessionId,
    title: () => props.title,
  })

  return (
    <div class="min-w-0">
      {state.isEditing() ? (
        <form class="grid gap-2" aria-label="Rename session" onSubmit={state.submit}>
          <label class="sr-only" for={inputId}>
            Session title
          </label>
          <input
            class="min-w-0 rounded-lg border border-[#30342a] bg-[#171a15] px-3 py-2 text-sm text-[#ebece5] outline-none focus:border-[#768d3d] disabled:opacity-60"
            id={inputId}
            name="title"
            type="text"
            maxlength={500}
            aria-describedby={state.errorMessage() ? errorId : undefined}
            aria-invalid={state.errorMessage() ? "true" : undefined}
            disabled={state.isSaving()}
            ref={state.inputBind}
            value={state.draft()}
            onInput={state.inputUpdate}
            onKeyDown={state.inputKeyDown}
          />
          {state.errorMessage() ? (
            <p class="m-0 text-xs text-[#d6a28b]" id={errorId} role="alert">
              {state.errorMessage()}
            </p>
          ) : null}
          <div class="flex justify-end gap-2">
            <button
              class="rounded-lg border border-[#30342a] px-3 py-1.5 text-xs text-[#a4a99c] disabled:opacity-50"
              type="button"
              disabled={state.isSaving()}
              onClick={state.cancel}
            >
              Cancel
            </button>
            <button
              class="rounded-lg bg-[#d8ff72] px-3 py-1.5 text-xs font-semibold text-[#171a13] disabled:cursor-not-allowed disabled:opacity-50"
              type="submit"
              disabled={!state.canSave()}
            >
              {state.isSaving() ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      ) : (
        <div class="flex min-w-0 items-center gap-2">
          <h2 class="m-0 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{state.displayedTitle()}</h2>
          <button
            class="shrink-0 rounded-md border border-[#30342a] px-2 py-1 text-xs text-[#a4a99c] hover:border-[#768d3d] hover:text-[#d8ff72]"
            type="button"
            aria-label={`Rename ${state.displayedTitle()}`}
            ref={state.editButtonBind}
            onClick={state.beginEdit}
          >
            Rename
          </button>
        </div>
      )}
    </div>
  )
}

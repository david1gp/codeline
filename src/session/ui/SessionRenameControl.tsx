import type { sessionRenameControlStateCreate } from "./sessionRenameControlStateCreate.js"

type SessionRenameControlProps = {
  state: ReturnType<typeof sessionRenameControlStateCreate>
}

export function SessionRenameControl(props: SessionRenameControlProps) {
  const state = props.state
  const inputId = "session-rename-title"
  const errorId = "session-rename-error"

  return (
    <div class="min-w-0">
      {state.isEditing() ? (
        <form class="grid gap-2" aria-label="Rename session" onSubmit={state.submit}>
          <label class="sr-only" for={inputId}>
            Session title
          </label>
          <input
            class="min-w-0 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-strong outline-none focus:border-accent-border disabled:opacity-60"
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
            <p class="m-0 text-xs text-danger" id={errorId} role="alert">
              {state.errorMessage()}
            </p>
          ) : null}
          <div class="flex justify-end gap-2">
            <button
              class="rounded-lg border border-line px-3 py-1.5 text-xs text-faint disabled:opacity-50"
              type="button"
              disabled={state.isSaving()}
              onClick={state.cancel}
            >
              Cancel
            </button>
            <button
              class="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-contrast disabled:cursor-not-allowed disabled:opacity-50"
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
            class="shrink-0 rounded-md border border-line px-2 py-1 text-xs text-faint hover:border-accent-border hover:text-accent"
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

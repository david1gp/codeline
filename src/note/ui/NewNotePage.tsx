import { NoteBackLink } from "./NoteBackLink.js"
import { NoteContentField } from "./NoteContentField.js"
import { NoteViewModeSwitcher } from "./NoteViewModeSwitcher.js"
import type { NewNoteScreenView } from "./newNoteScreenView.js"

export function NewNotePage(props: { state: NewNoteScreenView }) {
  const state = props.state

  return (
    <main class="min-h-0 overflow-auto px-5 py-8 sm:px-8 lg:px-10" aria-labelledby="new-note-heading">
      <div class="mx-auto max-w-3xl">
        <NoteBackLink />
        <header class="mb-6 flex items-end justify-between gap-4 border-line border-b pb-5">
          <div class="min-w-0">
            <p class="mb-2 font-mono text-[10px] font-bold tracking-[0.14em] text-accent uppercase">Notes</p>
            <h1 class="m-0 truncate text-3xl font-semibold tracking-[-0.04em]" id="new-note-heading">
              {state.title()}
            </h1>
            <p class="mt-2 mb-0 text-sm text-faint">The first line becomes the note heading.</p>
          </div>
          <NoteViewModeSwitcher viewMode={state.viewMode} viewModeSelect={state.viewModeSelect} />
        </header>

        <form onSubmit={state.submit}>
          <NoteContentField
            content={() => state.content()}
            contentUpdate={state.contentUpdate}
            placeholder={"Note heading\nAdd details..."}
            state={state.contentField}
            viewMode={state.viewMode}
            autofocus
          />
          <div class="mt-4 flex items-center justify-between gap-4">
            <p class="m-0 text-sm text-danger" role="alert">
              {state.hasError() ? "Couldn't save the note. Try again." : ""}
            </p>
            <button
              class="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-contrast disabled:cursor-not-allowed disabled:opacity-50"
              type="submit"
              disabled={state.isSaving() || state.content().trim() === ""}
            >
              {state.isSaving() ? "Saving..." : "Create note"}
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}

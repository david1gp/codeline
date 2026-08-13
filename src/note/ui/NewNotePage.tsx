import { NoteBackLink } from "./NoteBackLink.js"
import { NoteContentField } from "./NoteContentField.js"
import { NoteViewModeSwitcher } from "./NoteViewModeSwitcher.js"
import { newNotePageStateCreate } from "./newNotePageStateCreate.js"

export function NewNotePage() {
  const state = newNotePageStateCreate()

  return (
    <main class="min-h-0 overflow-auto px-5 py-8 sm:px-8 lg:px-10" aria-labelledby="new-note-heading">
      <div class="mx-auto max-w-3xl">
        <NoteBackLink />
        <header class="mb-6 flex items-end justify-between gap-4 border-[#30342a] border-b pb-5">
          <div class="min-w-0">
            <p class="mb-2 font-mono text-[10px] font-bold tracking-[0.14em] text-[#d8ff72] uppercase">Notes</p>
            <h1 class="m-0 truncate text-3xl font-semibold tracking-[-0.04em]" id="new-note-heading">
              {state.title()}
            </h1>
            <p class="mt-2 mb-0 text-sm text-[#969b8d]">The first line becomes the note heading.</p>
          </div>
          <NoteViewModeSwitcher viewMode={state.viewMode} viewModeSelect={state.viewModeSelect} />
        </header>

        <form onSubmit={state.submit}>
          <NoteContentField
            content={() => state.content()}
            contentUpdate={state.contentUpdate}
            placeholder={"Note heading\nAdd details..."}
            viewMode={state.viewMode}
            autofocus
          />
          <div class="mt-4 flex items-center justify-between gap-4">
            <p class="m-0 text-sm text-[#d6a28b]" role="alert">
              {state.hasError() ? "Couldn't save the note. Try again." : ""}
            </p>
            <button
              class="rounded-lg bg-[#d8ff72] px-5 py-2.5 text-sm font-semibold text-[#171a13] disabled:cursor-not-allowed disabled:opacity-50"
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

import { newNotePageStateCreate } from "./newNotePageStateCreate.js"
import { A } from "@solidjs/router"

export function NewNotePage() {
  const state = newNotePageStateCreate()

  return (
    <main class="min-h-0 overflow-auto px-5 py-8 sm:px-8 lg:px-10" aria-labelledby="new-note-heading">
      <div class="mx-auto max-w-3xl">
        <A class="mb-7 inline-flex text-sm text-[#969b8d] no-underline hover:text-[#d8ff72]" href="/notes">
          Back to notes
        </A>
        <header class="mb-6 border-[#30342a] border-b pb-5">
          <p class="mb-2 font-mono text-[10px] font-bold tracking-[0.14em] text-[#d8ff72] uppercase">Notes</p>
          <h1 class="m-0 text-3xl font-semibold tracking-[-0.04em]" id="new-note-heading">
            New note
          </h1>
          <p class="mt-2 mb-0 text-sm text-[#969b8d]">The first line becomes the note heading.</p>
        </header>

        <form onSubmit={state.submit}>
          <label class="sr-only" for="note-content">
            Note content
          </label>
          <textarea
            class="min-h-[24rem] w-full resize-y rounded-xl border border-[#30342a] bg-[#171a15] p-5 font-[inherit] text-[15px] leading-7 text-[#ebece5] outline-none placeholder:text-[#686d61] focus:border-[#768d3d]"
            id="note-content"
            value={state.content()}
            onInput={state.contentUpdate}
            placeholder={"Note heading\nAdd details..."}
            autofocus
            required
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

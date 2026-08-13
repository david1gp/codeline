import { For, Match, Show, Switch } from "solid-js"
import { A } from "@solidjs/router"
import { notePageStateCreate } from "./notePageStateCreate.js"

export function NotePage(props: { noteId: string }) {
  const state = notePageStateCreate({ noteId: props.noteId })

  return (
    <main class="min-h-0 overflow-auto px-5 py-8 sm:px-8 lg:px-10" aria-labelledby="note-heading">
      <div class="mx-auto max-w-3xl">
        <A class="mb-7 inline-flex text-sm text-[#969b8d] no-underline hover:text-[#d8ff72]" href="/notes">
          Back to notes
        </A>
        <header class="mb-6 flex items-end justify-between gap-4 border-[#30342a] border-b pb-5">
          <div>
            <p class="mb-2 font-mono text-[10px] font-bold tracking-[0.14em] text-[#d8ff72] uppercase">Notes</p>
            <h1 class="m-0 text-3xl font-semibold tracking-[-0.04em]" id="note-heading">
              Edit note
            </h1>
          </div>
          <Show when={state.note() !== undefined}>
            <button
              class="grid size-9 place-items-center rounded-lg border border-[#30342a] text-[#969b8d] hover:border-[#d6a28b] hover:text-[#d6a28b]"
              type="button"
              aria-label="Delete note"
              title="Delete note"
              onClick={state.deleteConfirmOpen}
            >
              <svg
                aria-hidden="true"
                class="size-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
              >
                <path d="M4 7h16M10 7V4.75h4V7M6.5 7l1 12.25h9L18 7" />
              </svg>
            </button>
          </Show>
        </header>

        <Switch>
          <Match when={state.isLoading()}>
            <p class="text-sm text-[#969b8d]" role="status">
              Loading note...
            </p>
          </Match>
          <Match when={state.isNotFound()}>
            <div class="rounded-xl border border-[#30342a] border-dashed px-6 py-14 text-center">
              <p class="m-0 text-sm text-[#969b8d]">This note no longer exists.</p>
            </div>
          </Match>
          <Match when={true}>
            <form onSubmit={state.submit}>
              <label class="sr-only" for="note-content">
                Note content
              </label>
              <textarea
                class="min-h-[24rem] w-full resize-y rounded-xl border border-[#30342a] bg-[#171a15] p-5 font-[inherit] text-[15px] leading-7 text-[#ebece5] outline-none placeholder:text-[#686d61] focus:border-[#768d3d]"
                id="note-content"
                value={state.content()}
                onInput={state.contentUpdate}
                required
              />

              <div class="mt-4 grid gap-2">
                <label class="text-xs font-semibold tracking-[0.06em] text-[#969b8d] uppercase" for="note-project">
                  Project
                </label>
                <select
                  class="w-full appearance-none rounded-lg border border-[#30342a] bg-[#1c1f19] px-3 py-2.5 text-sm text-[#ebece5]"
                  id="note-project"
                  value={state.projectPath()}
                  onChange={state.projectPathUpdate}
                >
                  <option value="">Unassigned</option>
                  <For each={state.projectPaths()}>{(path) => <option value={path}>{path}</option>}</For>
                </select>
              </div>

              <div class="mt-4 flex items-center justify-between gap-4">
                <p class="m-0 text-sm text-[#d6a28b]" role="alert">
                  {state.hasError() ? "Couldn't save the note. Try again." : ""}
                </p>
                <button
                  class="rounded-lg bg-[#d8ff72] px-5 py-2.5 text-sm font-semibold text-[#171a13] disabled:cursor-not-allowed disabled:opacity-50"
                  type="submit"
                  disabled={state.isSaving() || state.content().trim() === "" || !state.isDirty()}
                >
                  {state.isSaving() ? "Saving..." : "Save note"}
                </button>
              </div>
            </form>
          </Match>
        </Switch>

        <Show when={state.isDeleteConfirmOpen()}>
          <div class="fixed inset-0 z-20 grid place-items-center bg-[rgb(10_12_9_/_72%)] p-5">
            <div
              class="w-full max-w-md rounded-xl border border-[#30342a] bg-[#171a15] p-6"
              role="dialog"
              aria-modal="true"
              aria-labelledby="note-delete-heading"
            >
              <h2 class="m-0 text-lg font-semibold tracking-[-0.02em]" id="note-delete-heading">
                Delete note
              </h2>
              <p class="mt-3 mb-0 text-sm text-[#969b8d]">
                {`This permanently deletes ${state.lineCount()} ${state.lineCount() === 1 ? "line" : "lines"} of note content. This can't be undone.`}
              </p>
              <div class="mt-6 flex justify-end gap-3">
                <button
                  class="rounded-lg border border-[#30342a] px-4 py-2 text-sm text-[#a4a99c]"
                  type="button"
                  onClick={state.deleteConfirmClose}
                >
                  Cancel
                </button>
                <button
                  class="rounded-lg bg-[#d6a28b] px-4 py-2 text-sm font-semibold text-[#171a13] disabled:opacity-50"
                  type="button"
                  disabled={state.isSaving()}
                  onClick={state.deleteConfirm}
                >
                  Delete note
                </button>
              </div>
            </div>
          </div>
        </Show>
      </div>
    </main>
  )
}

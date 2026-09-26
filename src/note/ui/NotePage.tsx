import { For, Match, Show, Switch } from "solid-js"
import { NoteBackLink } from "./NoteBackLink.js"
import { NoteContentField } from "./NoteContentField.js"
import { NoteViewModeSwitcher } from "./NoteViewModeSwitcher.js"
import type { NoteScreenView } from "./noteScreenView.js"

export function NotePage(props: { state: NoteScreenView }) {
  const state = props.state

  return (
    <main class="min-h-0 overflow-auto px-5 py-8 sm:px-8 lg:px-10" aria-labelledby="note-heading">
      <div class="mx-auto max-w-3xl">
        <NoteBackLink />
        <header class="mb-6 flex items-end justify-between gap-4 border-line border-b pb-5">
          <div class="min-w-0">
            <p class="mb-2 font-mono text-[10px] font-bold tracking-[0.14em] text-accent uppercase">Notes</p>
            <h1 class="m-0 truncate text-3xl font-semibold tracking-[-0.04em]" id="note-heading">
              {state.title()}
            </h1>
          </div>
          <div class="flex items-center gap-2">
            <NoteViewModeSwitcher viewMode={state.viewMode} viewModeSelect={state.viewModeSelect} />
            <Show when={state.hasNote()}>
              <button
                class="grid size-9 place-items-center rounded-lg border border-line text-faint hover:border-danger hover:text-danger"
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
          </div>
        </header>

        <Switch>
          <Match when={state.isLoading()}>
            <p class="text-sm text-faint" role="status">
              Loading note...
            </p>
          </Match>
          <Match when={state.isNotFound()}>
            <div class="rounded-xl border border-line border-dashed px-6 py-14 text-center">
              <p class="m-0 text-sm text-faint">This note no longer exists.</p>
            </div>
          </Match>
          <Match when={true}>
            <form onSubmit={state.submit}>
              <NoteContentField
                content={() => state.content()}
                contentUpdate={state.contentUpdate}
                state={state.contentField}
                viewMode={state.viewMode}
              />

              <div class="mt-4 grid gap-2">
                <label class="text-xs font-semibold tracking-[0.06em] text-faint uppercase" for="note-project">
                  Project
                </label>
                <select
                  class="w-full appearance-none rounded-lg border border-line bg-surface-raised px-3 py-2.5 text-sm text-strong"
                  id="note-project"
                  value={state.projectId()}
                  onChange={state.projectIdUpdate}
                >
                  <option value="">Unassigned</option>
                  <For each={state.projects()}>{(project) => <option value={project.id}>{project.label}</option>}</For>
                </select>
              </div>

              <div class="mt-4 flex items-center justify-between gap-4">
                <p class="m-0 text-sm text-danger" role="alert">
                  {state.hasError() ? "Couldn't save the note. Try again." : ""}
                </p>
                <button
                  class="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-contrast disabled:cursor-not-allowed disabled:opacity-50"
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
          <div class="fixed inset-0 z-20 grid place-items-center bg-[var(--overlay)] p-5">
            <div
              class="w-full max-w-md rounded-xl border border-line bg-surface p-6"
              role="dialog"
              aria-modal="true"
              aria-labelledby="note-delete-heading"
            >
              <h2 class="m-0 text-lg font-semibold tracking-[-0.02em]" id="note-delete-heading">
                Delete note
              </h2>
              <p class="mt-3 mb-0 text-sm text-faint">
                {`This permanently deletes ${state.lineCount()} ${state.lineCount() === 1 ? "line" : "lines"} of note content. This can't be undone.`}
              </p>
              <div class="mt-6 flex justify-end gap-3">
                <button
                  class="rounded-lg border border-line px-4 py-2 text-sm text-faint"
                  type="button"
                  onClick={state.deleteConfirmClose}
                >
                  Cancel
                </button>
                <button
                  class="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-accent-contrast disabled:opacity-50"
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

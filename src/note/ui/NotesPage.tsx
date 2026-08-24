import { A } from "@solidjs/router"
import { For, Match, Show, Switch } from "solid-js"
import { Badge } from "#ui/static/badge/Badge.jsx"
import { noteContentSummarize } from "./noteContentSummarize.js"
import { noteDataStatusNoticeResolve } from "./noteDataStatusNoticeResolve.js"
import type { NotesScreenView } from "./notesScreenView.js"

export function NotesPage(props: { state: NotesScreenView }) {
  const state = props.state

  return (
    <main class="min-h-0 overflow-auto px-5 py-8 sm:px-8 lg:px-10" aria-labelledby="notes-heading">
      <header class="mx-auto mb-8 flex max-w-[96rem] items-end justify-between gap-5 border-line border-b pb-5">
        <div>
          <p class="mb-2 font-mono text-[10px] font-bold tracking-[0.14em] text-accent uppercase">Workspace</p>
          <h1 class="m-0 text-3xl font-semibold tracking-[-0.04em]" id="notes-heading">
            Notes
          </h1>
        </div>
        <A
          class="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast no-underline transition-colors hover:bg-accent-hover"
          href="/notes/new"
        >
          New note
        </A>
      </header>

      <div class="mx-auto max-w-[96rem]">
        <Show when={noteDataStatusNoticeResolve(state.dataStatus())} keyed>
          {(notice) => (
            <Badge class="mb-4" variant={notice.variant} role="status">
              {notice.label}
            </Badge>
          )}
        </Show>
        <Switch>
          <Match when={state.isLoading()}>
            <p class="text-sm text-faint" role="status">
              Loading notes...
            </p>
          </Match>
          <Match when={state.isError()}>
            <div class="flex items-center gap-4 text-sm text-danger" role="alert">
              <span>Couldn't load notes.</span>
              <button class="text-accent" type="button" onClick={state.retry}>
                Retry
              </button>
            </div>
          </Match>
          <Match when={state.isEmpty()}>
            <div class="rounded-xl border border-line border-dashed px-6 py-14 text-center">
              <p class="m-0 text-sm text-faint">No notes yet. Create one to capture an idea.</p>
            </div>
          </Match>
          <Match when={true}>
            <div class="grid gap-9">
              <For each={state.groups()}>
                {(group) => (
                  <section aria-label={group.projectPath === null ? "Unassigned notes" : group.label}>
                    <h2 class="mb-3 font-mono text-xs font-semibold tracking-[0.08em] text-faint uppercase">
                      {group.label}
                    </h2>
                    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                      <For each={group.notes}>
                        {(note) => {
                          const summary = noteContentSummarize(note.content)
                          return (
                            <A
                              class="group min-h-36 rounded-xl border border-line bg-surface p-5 no-underline transition-[border-color,background-color,transform] hover:-translate-y-0.5 hover:border-accent-border hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent"
                              href={`/notes/${encodeURIComponent(note.id)}`}
                            >
                              <h3 class="m-0 overflow-hidden text-ellipsis whitespace-nowrap text-base font-semibold tracking-[-0.02em] text-strong">
                                {summary.heading}
                              </h3>
                              <p class="mt-3 mb-0 line-clamp-2 whitespace-pre-line text-[13px] leading-5 text-faint">
                                {summary.preview || "No additional text."}
                              </p>
                            </A>
                          )
                        }}
                      </For>
                    </div>
                  </section>
                )}
              </For>
            </div>
          </Match>
        </Switch>
      </div>
    </main>
  )
}

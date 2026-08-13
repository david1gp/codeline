import { For, Match, Switch } from "solid-js"
import { A } from "@solidjs/router"
import { noteContentSummarize } from "./noteContentSummarize.js"
import { notesPageStateCreate } from "./notesPageStateCreate.js"

export function NotesPage() {
  const state = notesPageStateCreate()

  return (
    <main class="min-h-0 overflow-auto px-5 py-8 sm:px-8 lg:px-10" aria-labelledby="notes-heading">
      <header class="mx-auto mb-8 flex max-w-[96rem] items-end justify-between gap-5 border-[#30342a] border-b pb-5">
        <div>
          <p class="mb-2 font-mono text-[10px] font-bold tracking-[0.14em] text-[#d8ff72] uppercase">Workspace</p>
          <h1 class="m-0 text-3xl font-semibold tracking-[-0.04em]" id="notes-heading">
            Notes
          </h1>
        </div>
        <A
          class="rounded-lg bg-[#d8ff72] px-4 py-2.5 text-sm font-semibold text-[#171a13] no-underline transition-colors hover:bg-[#e3ff98]"
          href="/notes/new"
        >
          New note
        </A>
      </header>

      <div class="mx-auto max-w-[96rem]">
        <Switch>
          <Match when={state.isLoading()}>
            <p class="text-sm text-[#969b8d]" role="status">
              Loading notes...
            </p>
          </Match>
          <Match when={state.isError()}>
            <div class="flex items-center gap-4 text-sm text-[#d6a28b]" role="alert">
              <span>Couldn't load notes.</span>
              <button class="text-[#d8ff72]" type="button" onClick={state.retry}>
                Retry
              </button>
            </div>
          </Match>
          <Match when={state.isEmpty()}>
            <div class="rounded-xl border border-[#30342a] border-dashed px-6 py-14 text-center">
              <p class="m-0 text-sm text-[#969b8d]">No notes yet. Create one to capture an idea.</p>
            </div>
          </Match>
          <Match when={true}>
            <div class="grid gap-9">
              <For each={state.groups()}>
                {(group) => (
                  <section aria-label={group.projectPath ?? "Unassigned notes"}>
                    <h2 class="mb-3 font-mono text-xs font-semibold tracking-[0.08em] text-[#969b8d] uppercase">
                      {group.projectPath ?? "Unassigned"}
                    </h2>
                    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                      <For each={group.notes}>
                        {(note) => {
                          const summary = noteContentSummarize(note.content)
                          return (
                            <A
                              class="group min-h-36 rounded-xl border border-[#30342a] bg-[rgb(23_26_21_/_82%)] p-5 no-underline transition-[border-color,background-color,transform] hover:-translate-y-0.5 hover:border-[#768d3d] hover:bg-[#1c2118] focus-visible:outline-2 focus-visible:outline-[#d8ff72]"
                              href={`/notes/${encodeURIComponent(note.id)}`}
                            >
                              <h3 class="m-0 overflow-hidden text-ellipsis whitespace-nowrap text-base font-semibold tracking-[-0.02em] text-[#ebece5]">
                                {summary.heading}
                              </h3>
                              <p class="mt-3 mb-0 line-clamp-2 whitespace-pre-line text-[13px] leading-5 text-[#969b8d]">
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

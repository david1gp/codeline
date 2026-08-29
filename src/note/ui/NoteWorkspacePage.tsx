import { A } from "@solidjs/router"
import { For, Show } from "solid-js"
import { Badge } from "#ui/static/badge/Badge.jsx"
import { ProjectAvatar } from "../../project/ui/ProjectAvatar.js"
import { NotePage } from "./NotePage.js"
import { noteContentSummarize } from "./noteContentSummarize.js"
import { noteDataStatusNoticeResolve } from "./noteDataStatusNoticeResolve.js"
import type { NoteWorkspaceScreenView } from "./noteWorkspaceScreenView.js"

export function NoteWorkspacePage(props: { state: NoteWorkspaceScreenView }) {
  const state = props.state.sidebar

  return (
    <div class="grid min-h-0 grid-cols-1 gap-0 overflow-auto lg:grid-cols-[18rem_minmax(0,1fr)] xl:grid-cols-[18rem_minmax(0,1fr)_22rem] xl:overflow-hidden">
      <nav
        class="min-h-0 overflow-auto border-line border-b px-4 py-6 lg:border-r lg:border-b-0"
        aria-label="Note projects"
      >
        <div class="mb-4 flex items-center justify-between gap-3">
          <p class="m-0 font-mono text-[10px] font-bold tracking-[0.14em] text-accent uppercase">Notes</p>
          <A class="text-sm text-accent no-underline hover:underline" href="/notes/new">
            New
          </A>
        </div>

        <Show when={noteDataStatusNoticeResolve(state.dataStatus())} keyed>
          {(notice) => (
            <Badge class="mb-3" variant={notice.variant} role="status">
              {notice.label}
            </Badge>
          )}
        </Show>

        <Show when={state.isError()}>
          <div class="flex items-center gap-3 text-sm text-danger" role="alert">
            <span>Couldn't load notes.</span>
            <button class="text-accent" type="button" onClick={state.retry}>
              Retry
            </button>
          </div>
        </Show>
        <Show when={state.isLoading()}>
          <p class="text-sm text-faint" role="status">
            Loading notes...
          </p>
        </Show>

        <ul class="m-0 grid list-none gap-1 p-0">
          <For each={state.groups()}>
            {(group) => (
              <li>
                <span
                  class="flex items-center gap-1 px-2 py-1.5 font-mono text-xs font-semibold tracking-[0.08em] uppercase"
                  classList={{
                    "text-accent": group.projectId === state.activeProjectId(),
                    "text-faint": group.projectId !== state.activeProjectId(),
                  }}
                  aria-current={group.projectId === state.activeProjectId() ? "true" : undefined}
                >
                  <ProjectAvatar name={group.label} />
                  {group.label}
                </span>
                <ul class="m-0 grid list-none gap-0.5 p-0">
                  <For each={group.notes}>
                    {(note) => (
                      <li class="flex items-center gap-1">
                        <A
                          class="min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-sm no-underline hover:bg-surface-hover aria-[current=page]:bg-line-subtle aria-[current=page]:text-accent"
                          classList={{ "text-faint": note.id !== state.activeNoteId() }}
                          href={`/notes/${encodeURIComponent(note.id)}`}
                        >
                          {noteContentSummarize(note.content).heading}
                        </A>
                        <Show when={note.id === state.activeNoteId()}>
                          <span class="flex shrink-0 items-center gap-0.5">
                            <button
                              class="grid size-7 place-items-center rounded-md border border-line text-faint hover:text-strong disabled:cursor-not-allowed disabled:opacity-40"
                              type="button"
                              aria-label="Move note up"
                              title="Move note up"
                              disabled={!state.canMoveUp()}
                              onClick={state.noteMoveUp}
                            >
                              <svg
                                aria-hidden="true"
                                class="size-3.5"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                              >
                                <path d="M12 19V5M6 11l6-6 6 6" />
                              </svg>
                            </button>
                            <button
                              class="grid size-7 place-items-center rounded-md border border-line text-faint hover:text-strong disabled:cursor-not-allowed disabled:opacity-40"
                              type="button"
                              aria-label="Move note down"
                              title="Move note down"
                              disabled={!state.canMoveDown()}
                              onClick={state.noteMoveDown}
                            >
                              <svg
                                aria-hidden="true"
                                class="size-3.5"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                              >
                                <path d="M12 5v14M6 13l6 6 6-6" />
                              </svg>
                            </button>
                          </span>
                        </Show>
                      </li>
                    )}
                  </For>
                </ul>
              </li>
            )}
          </For>
        </ul>
      </nav>

      <NotePage state={props.state.detail} />

      <aside
        class="min-h-0 overflow-auto border-line border-t px-5 py-6 xl:border-t-0 xl:border-l"
        aria-label="Note preview and actions"
      >
        <h2 class="mt-0 mb-3 font-mono text-xs font-semibold tracking-[0.08em] text-faint uppercase">Preview</h2>
        <div
          class="rounded-xl border border-line bg-surface p-4 text-sm leading-6 text-strong [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_a]:text-accent [&_a]:underline [&_code]:rounded [&_code]:bg-line-subtle [&_code]:px-1 [&_code]:font-mono [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-surface-sunken [&_pre]:p-3"
          innerHTML={state.isPreviewEmpty() ? "<p>Nothing to preview yet.</p>" : state.previewHtml()}
        />

        <h2 class="mt-6 mb-3 font-mono text-xs font-semibold tracking-[0.08em] text-faint uppercase">Actions</h2>
        <p class="m-0 rounded-xl border border-line border-dashed px-4 py-6 text-center text-sm text-placeholder">
          Note actions arrive here.
        </p>
      </aside>
    </div>
  )
}

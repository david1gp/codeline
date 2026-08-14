import { Show } from "solid-js"
import { ProviderModelSelector } from "../providers/ui/ProviderModelSelector.js"
import { SelectedSession } from "./SelectedSession.js"
import { SessionList } from "./SessionList.js"
import { SessionTargetSelector } from "./SessionTargetSelector.js"
import type { WorkspaceScreenView } from "./workspaceScreenView.js"

export function WorkspacePage(props: { state: WorkspaceScreenView }) {
  const state = props.state.drawer

  return (
    <main class="grid min-h-0 grid-cols-[264px_minmax(0,1fr)] max-[760px]:block" id="workspace">
      <aside
        class="flex min-h-0 flex-col border-[var(--border)] border-r bg-[var(--surface)] px-[22px] pt-[30px] pb-5 max-[760px]:hidden"
        aria-label="Workspace navigation"
      >
        <div>
          <p class="mb-[9px] font-mono text-[10px] font-bold tracking-[0.14em] text-accent uppercase">Workspace</p>
          <h1 class="m-0 text-[19px] font-semibold tracking-[-0.02em]">Local session</h1>
          <p class="mt-2 mb-0 text-[13px] leading-[1.55] text-faint">No project or conversation is open.</p>
        </div>

        <SessionList state={props.state.sessionList} />

        <div class="flex items-center justify-between gap-3 font-mono text-[10px] text-placeholder">
          <span class="shortcut">Zero-synced foundation</span>
          <span class="version">v0.1</span>
        </div>
      </aside>

      <Show when={state.isSessionDrawerOpen()}>
        <div
          class="fixed inset-0 z-30 bg-[var(--overlay)] min-[761px]:hidden"
          aria-hidden="true"
          onClick={state.sessionDrawerClose}
        />
        <aside
          class="fixed inset-y-0 left-0 z-40 flex w-[min(86vw,340px)] flex-col overflow-y-auto border-[var(--border)] border-r bg-[var(--surface)] px-[22px] py-5 shadow-[18px_0_50px_var(--shadow-color-strong)] min-[761px]:hidden"
          id="mobile-session-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-session-drawer-heading"
          tabindex="-1"
          ref={state.sessionDrawerElement}
        >
          <div class="flex min-h-11 items-center justify-between gap-4">
            <h2 class="m-0 text-lg font-semibold" id="mobile-session-drawer-heading">
              Sessions
            </h2>
            <button
              class="min-h-11 min-w-11 rounded-lg border border-[var(--border)] px-3 text-sm text-[var(--muted-foreground)]"
              type="button"
              ref={state.sessionDrawerInitialFocus}
              aria-label="Close sessions"
              onClick={state.sessionDrawerClose}
            >
              Close
            </button>
          </div>
          <SessionList
            idPrefix="mobile-session"
            state={props.state.sessionList}
            onSessionSelect={state.sessionSelectHandle}
          />
        </aside>
      </Show>

      <section
        class="grid min-w-0 min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] max-[760px]:min-h-[calc(100dvh-110px)]"
        aria-label="Conversation workspace"
      >
        <div class="flex min-h-[74px] items-center gap-[18px] border-line-subtle border-b px-7 py-3 max-[760px]:items-stretch max-[760px]:gap-[9px] max-[760px]:overflow-x-auto max-[760px]:px-4">
          <button
            class="hidden min-h-11 shrink-0 items-center rounded-lg border border-accent-border bg-accent-soft px-4 text-sm font-semibold text-accent max-[760px]:flex"
            type="button"
            aria-controls="mobile-session-drawer"
            aria-expanded={state.isSessionDrawerOpen()}
            onClick={(event) => state.sessionDrawerOpen(event.currentTarget)}
          >
            Sessions
          </button>

          <SessionTargetSelector state={props.state.sessionTargetSelector} />

          <ProviderModelSelector state={props.state.providerModelSelector} />
        </div>

        <SelectedSession state={props.state.selectedSession} />
      </section>
    </main>
  )
}

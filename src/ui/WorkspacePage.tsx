import { Show } from "solid-js"
import { ApplicationShell } from "./ApplicationShell.js"
import { FilesPanel } from "./FilesPanel.js"
import { SelectedSession } from "./SelectedSession.js"
import { SessionSidebar } from "./SessionSidebar.js"
import { SessionTargetSelector } from "./SessionTargetSelector.js"
import { WorkspaceSetupPanel } from "./WorkspaceSetupPanel.js"
import type { WorkspaceScreenView } from "./workspaceScreenView.js"

export function WorkspacePage(props: { state: WorkspaceScreenView }) {
  const state = props.state.drawer

  return (
    <ApplicationShell
      state={props.state.shell}
      leftSidebar={
        <SessionSidebar
          activeProject={props.state.activeProject}
          sessionList={props.state.sessionList}
          sessionTarget={props.state.sessionTargetSelector}
        />
      }
      rightPanel={<FilesPanel close={props.state.shell.rightPanelClose} state={props.state.files} />}
      rightPanelLabel="Project files"
    >
      <Show when={state.isSessionDrawerOpen()}>
        <div
          class="fixed inset-0 z-30 bg-[var(--overlay)] min-[761px]:hidden"
          aria-hidden="true"
          onClick={state.sessionDrawerClose}
        />
        <aside
          class="fixed inset-y-0 left-0 z-40 flex w-[min(86vw,340px)] flex-col overflow-hidden border-[var(--border)] border-r bg-muted shadow-[18px_0_50px_var(--shadow-color-strong)] min-[761px]:hidden"
          id="mobile-session-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-session-drawer-heading"
          tabindex="-1"
          ref={state.sessionDrawerElement}
        >
          <SessionSidebar
            activeProject={props.state.activeProject}
            close={state.sessionDrawerClose}
            headingId="mobile-session-drawer-heading"
            idPrefix="mobile-session"
            initialFocus={state.sessionDrawerInitialFocus}
            sessionList={props.state.sessionList}
            sessionTarget={props.state.sessionTargetSelector}
          />
        </aside>
      </Show>

      <section
        class="relative flex h-full min-w-0 min-h-0 flex-col overflow-hidden max-[760px]:min-h-[calc(100dvh-110px)]"
        aria-label="Conversation workspace"
      >
        <div class="flex min-h-[56px] shrink-0 items-center gap-3 border-line-subtle border-b px-4 py-2 max-[760px]:items-stretch max-[760px]:gap-2 max-[760px]:overflow-x-auto">
          <button
            class="hidden min-h-11 shrink-0 items-center rounded-lg border border-accent-border bg-accent-soft px-4 text-sm font-semibold text-accent max-[760px]:flex"
            type="button"
            aria-controls="mobile-session-drawer"
            aria-expanded={state.isSessionDrawerOpen()}
            onClick={(event) => state.sessionDrawerOpen(event.currentTarget)}
          >
            Sessions
          </button>

          <Show when={props.state.selectedSession.hasSelection()}>
            <SessionTargetSelector state={props.state.sessionTargetSelector} />
          </Show>
        </div>

        <Show
          when={props.state.selectedSession.hasSelection()}
          fallback={<WorkspaceSetupPanel configuration={props.state.sessionTargetSelector.configurationReadiness()} />}
        >
          <SelectedSession providerModel={props.state.providerModelSelector} state={props.state.selectedSession} />
        </Show>
      </section>
    </ApplicationShell>
  )
}

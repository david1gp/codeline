import { Show } from "solid-js"
import { Icon } from "#ui/static/icon/Icon.jsx"
import { FilesPanel } from "../project/ui/FilesPanel.js"
import { SelectedSession } from "../session/ui/SelectedSession.js"
import { SessionSidebarNew } from "../session/ui/SessionSidebarNew.js"
import { SubagentThreadPanel } from "../session/ui/SubagentThreadPanel.js"
import { WorkspaceSetupPanel } from "../session/ui/WorkspaceSetupPanel.js"
import { ApplicationShell } from "./ApplicationShell.js"
import { applicationIcon } from "./applicationIcon.js"
import type { WorkspaceScreenView } from "./workspaceScreenView.js"
import { workspaceSessionPaneVisibleResolve } from "./workspaceSessionPaneVisibleResolve.js"
import "./sessionsWorkspace.css"
import { sessionsWorkspacePageStateCreate } from "./sessionsWorkspacePageStateCreate.js"

export function SessionsWorkspacePage(props: { state: WorkspaceScreenView }) {
  const state = sessionsWorkspacePageStateCreate(() => props.state)
  return (
    <div class="sessions-workspace">
      <ApplicationShell
        state={props.state.shell}
        leftSidebar={<SessionSidebarNew workspace={props.state} state={state.sidebar} />}
        rightPanel={
          <Show
            when={props.state.selectedSession.subagentThread.selected()}
            fallback={<FilesPanel close={props.state.shell.rightPanelClose} state={props.state.files} />}
          >
            <SubagentThreadPanel state={props.state.selectedSession} />
          </Show>
        }
        rightPanelLabel={props.state.selectedSession.subagentThread.selected() ? "Subagent thread" : "Project files"}
      >
        <Show when={props.state.drawer.isSessionDrawerOpen()}>
          <div
            class="fixed inset-0 z-30 bg-[var(--overlay)] min-[761px]:hidden"
            aria-hidden="true"
            onClick={props.state.drawer.sessionDrawerClose}
          />
          <aside
            class="sessions-workspace-mobile-drawer"
            id="mobile-session-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-session-drawer-heading"
            tabIndex={-1}
            ref={props.state.drawer.sessionDrawerElement}
          >
            <SessionSidebarNew
              workspace={props.state}
              state={state.sidebar}
              close={props.state.drawer.sessionDrawerClose}
              headingId="mobile-session-drawer-heading"
              initialFocus={props.state.drawer.sessionDrawerInitialFocus}
              mobile
            />
          </aside>
        </Show>
        <section
          class="sessions-workspace-conversation"
          aria-label="Conversation workspace"
          inert={props.state.drawer.isSessionDrawerOpen()}
        >
          <div class="sessions-workspace-topbar">
            <button
              class="sessions-workspace-mobile-trigger"
              type="button"
              aria-controls="mobile-session-drawer"
              aria-expanded={props.state.drawer.isSessionDrawerOpen()}
              onClick={(event) => props.state.drawer.sessionDrawerOpen(event.currentTarget)}
            >
              Sessions
            </button>
            <span class="sessions-workspace-topbar-title">
              {props.state.selectedSession.session()?.title ?? "New session"}
            </span>
            <button class="sessions-workspace-files-button" type="button" onClick={props.state.shell.rightPanelShow}>
              <Icon path={applicationIcon.folderGroup} class="size-4 shrink-0 fill-current" />
              Files
            </button>
          </div>
          <Show
            when={workspaceSessionPaneVisibleResolve({
              configurationStatus: props.state.sessionTargetSelector.configurationReadiness().status,
              hasSelectedSession: props.state.selectedSession.session() !== undefined,
              readOnlyReason: props.state.selectedSession.readOnlyReason(),
            })}
            fallback={
              <WorkspaceSetupPanel configuration={props.state.sessionTargetSelector.configurationReadiness()} />
            }
          >
            <SelectedSession
              activeProject={props.state.activeProject}
              providerModel={props.state.providerModelSelector}
              resources={props.state.sessionResourceSelector}
              sessionTarget={props.state.sessionTargetSelector}
              shell={props.state.shell}
              state={props.state.selectedSession}
            />
          </Show>
        </section>
      </ApplicationShell>
    </div>
  )
}

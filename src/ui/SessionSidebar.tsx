import { Show } from "solid-js"
import type { ProjectRegistryState } from "../project/ui/projectRegistryStateCreate.js"
import type { ActiveProjectState } from "./activeProjectStateCreate.js"
import { NewSessionDialog } from "./NewSessionDialog.js"
import { SessionList } from "./SessionList.js"
import type { SessionProjectIdOverride } from "./sessionProjectIdOverride.js"
import type { SessionProjectPathOverride } from "./sessionProjectPathOverride.js"
import type { SessionListState } from "./sessionListStateCreate.js"
import type { SessionTargetSelectorState } from "./sessionTargetSelectorStateCreate.js"

export function SessionSidebar(props: {
  activeProject: ActiveProjectState
  close?: () => void
  headingId?: string
  idPrefix?: string
  initialFocus?: (element: HTMLElement) => void
  projectIdOverride?: SessionProjectIdOverride
  projectPathOverride: SessionProjectPathOverride
  projectRegistry?: ProjectRegistryState
  sessionList: SessionListState
  sessionTarget: SessionTargetSelectorState
}) {
  return (
    <div class="flex h-full min-h-0 flex-col bg-muted">
      <header class="shrink-0 border-line border-b px-2.5 py-1.5">
        <Show when={props.close !== undefined}>
          <div class="mb-2 flex items-center justify-end">
            <button
              class="flex h-8 items-center justify-center rounded-[7px] border border-line bg-surface-hover px-2.5 text-xs text-faint hover:text-strong"
              type="button"
              ref={props.initialFocus}
              aria-label="Close sessions"
              onClick={props.close}
            >
              Close
            </button>
          </div>
        </Show>
        <h2 class="sr-only" id={props.headingId}>
          Sessions
        </h2>
        <NewSessionDialog
          activeProject={props.activeProject}
          idPrefix={props.idPrefix ?? "desktop-session"}
          projectIdOverride={props.projectIdOverride}
          projectPathOverride={props.projectPathOverride}
          projectRegistry={props.projectRegistry}
          projects={props.projectRegistry ? props.projectRegistry.projects : props.sessionList.sidebar.projectGroups}
          sessionTarget={props.sessionTarget}
        />
        <Show when={props.sessionTarget.sessionCreateStatus() === "error"}>
          <p class="mt-2 mb-0 text-[11px] text-danger" role="alert">
            The new session could not be created. Select New Session to retry.
          </p>
        </Show>
      </header>

      <SessionList
        activeProject={props.activeProject}
        idPrefix={props.idPrefix}
        projectRegistry={props.projectRegistry}
        state={props.sessionList}
        onSessionSelect={props.close}
        sessionCreateInProject={(projectPath, projectId) =>
          void props.sessionTarget.sessionCreateStart(projectPath, undefined, projectId)
        }
      />
    </div>
  )
}

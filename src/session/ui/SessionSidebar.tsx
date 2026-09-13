import { Show } from "solid-js"
import type { ProjectRegistryState } from "../../project/ui/projectRegistryState.js"
import type { ActiveProjectState } from "../../project/ui/activeProjectStateCreate.js"
import { SessionList } from "./SessionList.js"
import type { SessionListState } from "./sessionListStateCreate.js"
import type { SessionTargetSelectorState } from "./sessionTargetSelectorStateCreate.js"

export function SessionSidebar(props: {
  activeProject: ActiveProjectState
  close?: () => void
  headingId?: string
  idPrefix?: string
  initialFocus?: (element: HTMLElement) => void
  projectCreateOpen?: () => boolean
  projectCreateOpenChange?: (open: boolean) => void
  projectRegistry?: ProjectRegistryState
  sessionList: SessionListState
  sessionTarget: SessionTargetSelectorState
}) {
  return (
    <div class="flex h-full min-h-0 flex-col bg-[var(--sidebar-background)]">
      <Show when={props.close !== undefined}>
        <div class="shrink-0 px-2.5 py-1.5">
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
        </div>
      </Show>
      <h2 class="sr-only" id={props.headingId}>
        Sessions
      </h2>
      <Show when={props.sessionTarget.sessionCreateStatus() === "error"}>
        <div class="shrink-0 px-2.5 py-1.5">
          <p class="mt-2 mb-0 text-[11px] text-danger" role="alert">
            The new session could not be created. Use New Session in the top navigation to retry.
          </p>
        </div>
      </Show>

      <SessionList
        activeProject={props.activeProject}
        idPrefix={props.idPrefix}
        projectRegistry={props.projectRegistry}
        projectCreateOpen={props.projectCreateOpen}
        projectCreateOpenChange={props.projectCreateOpenChange}
        state={props.sessionList}
        onSessionSelect={props.close}
        sessionNewInProject={(target) => props.sessionTarget.sessionNewInProject(target)}
        sessionCreateInProject={(target) => void props.sessionTarget.sessionCreateStart(target)}
      />
    </div>
  )
}

import { mdiPlus } from "@adaptive-ds/mdi/mdiPlus.js"
import { Show } from "solid-js"
import { Button } from "#ui/interactive/button/Button.jsx"
import { buttonVariant } from "#ui/interactive/button/buttonCva.js"
import { Icon } from "#ui/static/icon/Icon.jsx"
import type { ProjectRegistryState } from "../project/ui/projectRegistryState.js"
import type { ActiveProjectState } from "./activeProjectStateCreate.js"
import { SessionList } from "./SessionList.js"
import type { SessionListState } from "./sessionListStateCreate.js"
import type { SessionTargetSelectorState } from "./sessionTargetSelectorStateCreate.js"

export function SessionSidebar(props: {
  activeProject: ActiveProjectState
  close?: () => void
  headingId?: string
  idPrefix?: string
  initialFocus?: (element: HTMLElement) => void
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
        <Button
          class="h-9 w-full justify-center"
          variant={buttonVariant.contrast}
          onClick={() => props.sessionTarget.sessionNew?.()}
        >
          <Icon path={mdiPlus} class="mr-2 size-4" />
          New Session
        </Button>
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
        sessionCreateInProject={(target) => void props.sessionTarget.sessionCreateStart(target)}
      />
    </div>
  )
}

import { Show } from "solid-js"
import { SessionList } from "./SessionList.js"
import type { SessionListState } from "./sessionListStateCreate.js"
import type { SessionTargetSelectorState } from "./sessionTargetSelectorStateCreate.js"

export function SessionSidebar(props: {
  close?: () => void
  headingId?: string
  idPrefix?: string
  initialFocus?: (element: HTMLElement) => void
  sessionList: SessionListState
  sessionTarget: SessionTargetSelectorState
}) {
  return (
    <div class="flex h-full min-h-0 flex-col bg-muted">
      <header class="shrink-0 border-line border-b px-2.5 pt-3 pb-2.5">
        <div class="flex items-center justify-between gap-2">
          <h2 class="m-0 truncate text-[15px] font-semibold tracking-[-0.02em]" id={props.headingId}>
            Sessions
          </h2>
          <div class="flex items-center gap-1.5">
            <button
              class="flex h-8 items-center justify-center gap-1.5 rounded-[7px] border border-line bg-surface-hover px-2.5 text-xs font-medium text-faint transition-colors hover:border-accent-border hover:bg-surface-sunken hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              disabled={!props.sessionTarget.canCreateSession()}
              title="Start a new session with the selected agent"
              onClick={() => void props.sessionTarget.sessionCreateStart()}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <path d="M6 1v10M1 6h10" />
              </svg>
              <Show when={props.sessionTarget.isCreatingSession()} fallback="New">
                Creating
              </Show>
            </button>
            <Show when={props.close !== undefined}>
              <button
                class="flex h-8 items-center justify-center rounded-[7px] border border-line bg-surface-hover px-2.5 text-xs text-faint hover:text-strong"
                type="button"
                ref={props.initialFocus}
                aria-label="Close sessions"
                onClick={props.close}
              >
                Close
              </button>
            </Show>
          </div>
        </div>
        <Show when={props.sessionTarget.sessionCreateStatus() === "error"}>
          <p class="mt-2 mb-0 text-[11px] text-danger" role="alert">
            The new session could not be created. Select New to retry.
          </p>
        </Show>
      </header>

      <SessionList idPrefix={props.idPrefix} state={props.sessionList} onSessionSelect={props.close} />
    </div>
  )
}

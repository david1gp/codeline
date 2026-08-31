import { mdiPinOffOutline } from "@adaptive-ds/mdi/mdiPinOffOutline.js"
import { mdiPinOutline } from "@adaptive-ds/mdi/mdiPinOutline.js"
import { Match, Show, Switch } from "solid-js"
import { ButtonIconOnly } from "#ui/interactive/button/ButtonIconOnly.jsx"
import { Details } from "#ui/interactive/details/Details.jsx"
import type { providerModelSelectorStateCreate } from "../providers/ui/providerModelSelectorStateCreate.js"
import { SessionRenameControl } from "../session/ui/SessionRenameControl.js"
import type { ActiveProjectState } from "./activeProjectStateCreate.js"
import type { applicationShellStateCreate } from "./applicationShellStateCreate.js"
import { SessionCapturedContextInspector } from "./SessionCapturedContextInspector.js"
import { SessionChat } from "./SessionChat.js"
import { SessionCreationResourceSidebar } from "./SessionCreationResourceSidebar.js"
import { SessionDisplayModeSwitcher } from "./SessionDisplayModeSwitcher.js"
import { SessionProjectSelector } from "./SessionProjectSelector.js"
import { SessionSemanticHistory } from "./SessionSemanticHistory.js"
import { SessionStreamView } from "./SessionStreamView.js"
import type { SelectedSessionView } from "./selectedSessionView.js"
import type { SessionResourceSelectorView } from "./sessionResourceSelectorView.js"
import type { SessionTargetSelectorState } from "./sessionTargetSelectorStateCreate.js"

export function SelectedSession(props: {
  activeProject?: ActiveProjectState
  providerModel?: ReturnType<typeof providerModelSelectorStateCreate>
  resources?: SessionResourceSelectorView
  sessionTarget?: SessionTargetSelectorState
  shell?: ReturnType<typeof applicationShellStateCreate>
  state: SelectedSessionView
}) {
  return (
    <>
      <div class="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <Switch>
          <Match when={!props.state.hasSelection()}>
            {/* Creation surface: the draft owns the remaining height, the still-mutable
                selection sits in a compact sidebar beside it. */}
            {/* Tailwind `max-[n]` compiles to `width < n`, so the stacked breakpoint uses 1101
                to match the plain CSS `max-width: 1100px` rules and the JS `> 1100` desktop check. */}
            <div class="flex min-h-0 min-w-0 flex-1 max-[1101px]:flex-col max-[1101px]:overflow-y-auto">
              <div class="flex min-h-0 min-w-0 flex-1 flex-col max-[1101px]:min-h-[60vh]">
                <div class="shrink-0 px-4 pt-6 pb-4 text-center max-[760px]:px-3 max-[760px]:pt-4">
                  <h2 class="m-0 text-2xl font-semibold tracking-[-0.02em]">
                    Select a conversation or start a new one.
                  </h2>
                </div>
                <SessionChat
                  isFilling
                  projectSelector={
                    <Show when={props.resources}>
                      {(resources) => (
                        <SessionProjectSelector
                          activeProject={props.activeProject}
                          idPrefix="workspace-setup-project"
                          state={resources()}
                        />
                      )}
                    </Show>
                  }
                  providerModel={props.providerModel}
                  sessionTarget={props.sessionTarget}
                  state={props.state.initialChat}
                />
              </div>

              <Show when={props.resources}>
                {(resources) => (
                  <SessionCreationResourceSidebar
                    idPrefix="workspace-setup-resources"
                    shell={props.shell}
                    state={resources()}
                  />
                )}
              </Show>
            </div>
          </Match>
          <Match when={props.state.isSessionError()}>
            <div
              class="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center text-[13px] text-danger"
              role="alert"
            >
              <p class="m-0">Selected conversation is unavailable.</p>
              <button
                class="cursor-pointer rounded-lg border border-accent-border bg-accent-soft px-3 py-1.5 text-accent"
                type="button"
                onClick={props.state.retrySession}
              >
                Retry
              </button>
            </div>
          </Match>
          <Match when={props.state.isSessionLoading() && !props.state.session()}>
            <div class="flex flex-1 items-center justify-center text-[13px] text-faint" role="status">
              Loading conversation...
            </div>
          </Match>
          <Match when={props.state.session()} keyed>
            {(_session) => (
              <div class="min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pt-4 pb-2 max-[760px]:px-3">
                <div class="mx-auto w-full max-w-[820px] min-w-0">
                  <header class="mb-4 border-line-subtle border-b pb-3">
                    <p class="m-0 text-[11px] text-faint">Conversation</p>
                    <div class="mt-1 flex min-w-0 items-start justify-between gap-2 text-lg font-semibold tracking-[-0.02em]">
                      <div class="min-w-0 flex-1">
                        <Show
                          when={props.state.readOnlyReason() === null ? props.state.renameState() : undefined}
                          fallback={
                            <h2 class="m-0 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                              {props.state.session()?.title}
                            </h2>
                          }
                        >
                          {(rename) => <SessionRenameControl state={rename()} />}
                        </Show>
                      </div>
                      <div class="mt-0.5 flex shrink-0 items-center gap-1.5">
                        <SessionDisplayModeSwitcher state={props.state.displayMode} />
                        <Show when={props.state.readOnlyReason() === null ? props.state.pinState() : undefined}>
                          {(pin) => (
                            <ButtonIconOnly
                              class="size-8 text-faint hover:bg-surface-hover hover:text-accent"
                              icon={pin().pinned() ? mdiPinOutline : mdiPinOffOutline}
                              iconClass="size-4"
                              isLoading={pin().isSaving()}
                              title={pin().pinned() ? "Unpin session" : "Pin session"}
                              aria-label={pin().pinned() ? "Unpin session" : "Pin session"}
                              aria-pressed={pin().pinned()}
                              onClick={pin().toggle}
                            />
                          )}
                        </Show>
                      </div>
                    </div>
                    <Show when={props.state.readOnlyNotice()}>
                      {(notice) => (
                        <p class="mt-1 mb-0 text-xs font-normal text-faint" data-session-read-only="true" role="status">
                          {notice()}
                        </p>
                      )}
                    </Show>
                    <Show when={props.state.pinState()?.errorMessage()}>
                      {(message) => (
                        <p class="mt-1 mb-0 text-xs font-normal text-danger" role="alert">
                          {message()}
                        </p>
                      )}
                    </Show>
                  </header>

                  <SessionSemanticHistory state={props.state} />

                  <Show when={props.state.displayMode.mode() === "stream"}>
                    <div class="mt-5 border-line-subtle border-t pt-5">
                      <SessionStreamView state={props.state} />
                    </div>
                  </Show>

                  <Show when={props.state.isMessagesRefreshing()}>
                    <span class="mt-3 block py-2 text-[13px] text-faint" role="status">
                      Updating messages...
                    </span>
                  </Show>

                  <Show when={props.resources}>
                    {(resources) => (
                      <div class="mt-6">
                        <Details
                          class="!bg-surface-raised !border-line"
                          summaryClass="!p-3 !text-sm"
                          title="Captured execution context"
                        >
                          <div class="px-3 pb-3">
                            <SessionCapturedContextInspector idPrefix="selected-session-context" state={resources()} />
                          </div>
                        </Details>
                      </div>
                    )}
                  </Show>
                </div>
              </div>
            )}
          </Match>
        </Switch>
      </div>

      {/* The creation surface renders its own full-height composer, so the docked
          composer only appears once a conversation is selected. */}
      <Show when={props.state.hasSelection()}>
        <Show
          when={props.state.isInitialChatVisible()}
          fallback={
            <SelectedSessionChat
              sessionTarget={props.sessionTarget}
              state={props.state}
              providerModel={props.providerModel}
            />
          }
        >
          <SessionChat
            providerModel={props.providerModel}
            sessionTarget={props.sessionTarget}
            state={props.state.initialChat}
          />
        </Show>
      </Show>
    </>
  )
}

function SelectedSessionChat(props: {
  providerModel?: ReturnType<typeof providerModelSelectorStateCreate>
  sessionTarget?: SessionTargetSelectorState
  state: SelectedSessionView
}) {
  return (
    <Show when={props.state.session()?.id} keyed fallback={null}>
      {(sessionId) => (
        <SessionChat
          providerModel={props.providerModel}
          sessionTarget={props.sessionTarget}
          state={props.state.chatCreate(sessionId)}
        />
      )}
    </Show>
  )
}

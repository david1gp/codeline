import { mdiEyeOffOutline, mdiEyeOutline } from "@mdi/js"
import { For, Match, Show, Switch } from "solid-js"
import { ButtonIconOnly } from "#ui/interactive/button/ButtonIconOnly.jsx"
import { FinalizedMessage } from "../message/ui/FinalizedMessage.js"
import type { providerModelSelectorStateCreate } from "../providers/ui/providerModelSelectorStateCreate.js"
import { SessionRenameControl } from "../session/ui/SessionRenameControl.js"
import { SessionChat } from "./SessionChat.js"
import { SessionDisplayModeSwitcher } from "./SessionDisplayModeSwitcher.js"
import { SessionStreamView } from "./SessionStreamView.js"
import type { SelectedSessionView } from "./selectedSessionView.js"
import type { SessionTargetSelectorState } from "./sessionTargetSelectorStateCreate.js"

export function SelectedSession(props: {
  providerModel?: ReturnType<typeof providerModelSelectorStateCreate>
  sessionTarget?: SessionTargetSelectorState
  state: SelectedSessionView
}) {
  return (
    <>
      <div class="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <Switch>
          <Match when={!props.state.hasSelection()}>
            <div class="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-8 text-center">
              <div class="w-full max-w-[820px]">
                <p class="m-0 text-[11px] font-semibold tracking-[0.14em] text-faint uppercase">Conversations</p>
                <h2 class="mt-2 mb-0 text-2xl font-semibold tracking-[-0.02em]">Select a session</h2>
                <p class="mx-auto mt-3 mb-0 max-w-[540px] text-sm leading-relaxed text-faint">
                  Choose an active conversation to read its finalized messages.
                </p>
              </div>
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
          <Match when={props.state.isSessionLoading() || !props.state.session()}>
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
                        <SessionRenameControl state={props.state.renameState()!} />
                      </div>
                      <div class="mt-0.5 flex shrink-0 items-center gap-1.5">
                        <SessionDisplayModeSwitcher state={props.state.displayMode} />
                        <ButtonIconOnly
                          class="size-8 text-faint hover:bg-surface-hover hover:text-accent"
                          icon={props.state.watchState()!.watched() ? mdiEyeOutline : mdiEyeOffOutline}
                          iconClass="size-4"
                          isLoading={props.state.watchState()!.isSaving()}
                          title={props.state.watchState()!.watched() ? "Stop watching session" : "Watch session"}
                          aria-label={props.state.watchState()!.watched() ? "Stop watching session" : "Watch session"}
                          aria-pressed={props.state.watchState()!.watched()}
                          onClick={props.state.watchState()!.toggle}
                        />
                      </div>
                    </div>
                    <Show when={props.state.watchState()!.errorMessage()}>
                      {(message) => (
                        <p class="mt-1 mb-0 text-xs font-normal text-danger" role="alert">
                          {message()}
                        </p>
                      )}
                    </Show>
                  </header>

                  <Switch>
                    <Match when={props.state.isMessagesError()}>
                      <div
                        class="flex flex-col items-center gap-2 py-8 text-center text-[13px] text-danger"
                        role="alert"
                      >
                        <p class="m-0">Finalized messages are unavailable.</p>
                        <button
                          class="cursor-pointer rounded-lg border border-accent-border bg-accent-soft px-3 py-1.5 text-accent"
                          type="button"
                          onClick={props.state.retryMessages}
                        >
                          Retry
                        </button>
                      </div>
                    </Match>
                    <Match when={props.state.displayMode.mode() === "stream"}>
                      <SessionStreamView state={props.state} />
                    </Match>
                    <Match when={props.state.isMessagesLoading()}>
                      <div class="py-8 text-center text-[13px] text-faint" role="status">
                        Loading messages...
                      </div>
                    </Match>
                    <Match when={props.state.isMessagesEmpty()}>
                      <div class="py-8 text-center text-[13px] text-faint">No finalized messages yet.</div>
                    </Match>
                    <Match when={true}>
                      <ol class="m-0 grid list-none gap-4 p-0" aria-label="Finalized messages">
                        <For each={props.state.messages()}>
                          {(message) =>
                            message.role === "assistant" || message.role === "user" ? (
                              <li class="min-w-0">
                                <FinalizedMessage
                                  content={message.content}
                                  role={message.role}
                                  state={message.copyState}
                                />
                              </li>
                            ) : null
                          }
                        </For>
                      </ol>
                    </Match>
                  </Switch>

                  <Show when={props.state.isMessagesRefreshing()}>
                    <span class="mt-3 block py-2 text-[13px] text-faint" role="status">
                      Updating messages...
                    </span>
                  </Show>
                </div>
              </div>
            )}
          </Match>
        </Switch>
      </div>

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
        <SessionChat state={props.state.initialChat} />
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
    <Show
      when={props.state.session()?.id}
      keyed
      fallback={
        <section class="shrink-0 px-4 pb-2 max-[760px]:px-3" aria-label="Chat composer unavailable">
          <div class="mx-auto flex w-full max-w-[820px] items-center justify-between gap-3 rounded-[14px] border border-line bg-surface px-3 py-2.5 text-[13px] text-disabled shadow-[0_1px_2px_var(--shadow-color),0_8px_24px_-12px_var(--shadow-color-strong)]">
            <span>Select an active conversation to send a message.</span>
            <button
              class="shrink-0 rounded-lg border-none bg-disabled-surface px-3.5 py-1.5 text-[13px] font-semibold text-disabled max-[760px]:hidden"
              type="button"
              disabled
            >
              Send
            </button>
          </div>
        </section>
      }
    >
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

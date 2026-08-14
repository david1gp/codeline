import { For, Match, Show, Switch } from "solid-js"
import { FinalizedMessage } from "../message/ui/FinalizedMessage.js"
import { SessionRenameControl } from "../session/ui/SessionRenameControl.js"
import type { SelectedSessionView } from "./selectedSessionView.js"
import { SessionChat } from "./SessionChat.js"

export function SelectedSession(props: { state: SelectedSessionView }) {
  return (
    <>
      <Switch>
        <Match when={!props.state.hasSelection()}>
          <div class="w-[min(620px,calc(100%-48px))] self-center justify-self-center overflow-y-auto py-[54px] text-center max-[760px]:w-[calc(100%-32px)] max-[760px]:max-w-[560px] max-[760px]:py-10">
            <div
              class="relative mx-auto mb-[30px] grid size-[82px] rotate-[-2deg] place-items-center rounded-3xl border border-accent-border bg-gradient-to-br from-[var(--emblem-from)] to-[var(--emblem-to)] font-mono text-xl text-accent shadow-[0_26px_70px_var(--shadow-color),inset_0_0_30px_var(--emblem-glow)] after:absolute after:inset-2 after:rounded-[17px] after:border after:border-[var(--emblem-glow)] max-[760px]:mb-[25px] max-[760px]:size-[70px] max-[760px]:rounded-[21px]"
              aria-hidden="true"
            >
              <span>&gt;_</span>
            </div>
            <p class="mb-[9px] font-mono text-[10px] font-bold tracking-[0.14em] text-accent uppercase">
              Conversations
            </p>
            <h2 class="m-0 text-[clamp(28px,4vw,44px)] font-semibold leading-[1.08] tracking-[-0.045em]">
              Select a session
            </h2>
            <p class="mx-auto mt-[18px] mb-0 max-w-[540px] text-sm leading-[1.7] text-faint max-[760px]:text-[13px]">
              Choose an active conversation to read its finalized messages.
            </p>
          </div>
        </Match>
        <Match when={props.state.isSessionError()}>
          <div
            class="w-[min(560px,calc(100%-48px))] self-center justify-self-center text-center text-[13px] text-faint"
            role="alert"
          >
            <p>Selected conversation is unavailable.</p>
            <button
              class="rounded-[7px] border border-accent-border bg-accent-soft px-3 py-[7px] text-accent"
              type="button"
              onClick={props.state.retrySession}
            >
              Retry
            </button>
          </div>
        </Match>
        <Match when={props.state.isSessionLoading() || !props.state.session()}>
          <div
            class="w-[min(560px,calc(100%-48px))] self-center justify-self-center text-center text-[13px] text-faint"
            role="status"
          >
            Loading conversation...
          </div>
        </Match>
        <Match when={props.state.session()} keyed>
          {(session) => (
            <div class="min-h-0 overflow-y-auto px-[clamp(24px,6vw,84px)] pt-[38px] pb-[52px] max-[760px]:px-4 max-[760px]:pt-7 max-[760px]:pb-10">
              <header class="mx-auto mb-[34px] w-[min(760px,100%)] border-line-subtle border-b pb-[22px]">
                <p class="mb-[9px] font-mono text-[10px] font-bold tracking-[0.14em] text-accent uppercase">
                  Conversation
                </p>
                <div class="text-[clamp(24px,3vw,36px)] font-semibold tracking-[-0.035em]">
                  <SessionRenameControl state={props.state.renameState()!} />
                </div>
              </header>

              <Switch>
                <Match when={props.state.isMessagesError()}>
                  <div
                    class="w-[min(560px,calc(100%-48px))] self-center justify-self-center text-center text-[13px] text-faint"
                    role="alert"
                  >
                    <p>Finalized messages are unavailable.</p>
                    <button
                      class="rounded-[7px] border border-accent-border bg-accent-soft px-3 py-[7px] text-accent"
                      type="button"
                      onClick={props.state.retryMessages}
                    >
                      Retry
                    </button>
                  </div>
                </Match>
                <Match when={props.state.isMessagesLoading()}>
                  <div
                    class="w-[min(560px,calc(100%-48px))] self-center justify-self-center text-center text-[13px] text-faint"
                    role="status"
                  >
                    Loading messages...
                  </div>
                </Match>
                <Match when={props.state.isMessagesEmpty()}>
                  <div class="w-[min(560px,calc(100%-48px))] self-center justify-self-center text-center text-[13px] text-faint">
                    No finalized messages yet.
                  </div>
                </Match>
                <Match when={true}>
                  <ol class="mx-auto grid w-[min(760px,100%)] list-none gap-6 m-0 p-0" aria-label="Finalized messages">
                    <For each={props.state.messages()}>
                      {(message) =>
                        message.role === "assistant" || message.role === "user" ? (
                          <li>
                            <FinalizedMessage content={message.content} role={message.role} state={message.copyState} />
                          </li>
                        ) : null
                      }
                    </For>
                  </ol>
                </Match>
              </Switch>

              <Show when={props.state.isMessagesRefreshing()}>
                <span
                  class="mx-auto mt-[18px] block w-[min(760px,100%)] font-mono text-[9px] text-placeholder"
                  role="status"
                >
                  Updating messages...
                </span>
              </Show>
            </div>
          )}
        </Match>
      </Switch>

      <Show
        when={props.state.session()?.id}
        keyed
        fallback={
          <div
            class="mx-7 mb-6 flex min-h-[74px] items-center justify-between gap-5 rounded-xl border border-line bg-surface-raised p-3 pl-[17px] text-[13px] text-disabled shadow-[0_18px_48px_var(--shadow-color)] max-[760px]:mx-3.5 max-[760px]:mb-3.5 max-[760px]:min-h-[66px]"
            aria-label="Chat composer unavailable"
          >
            <div>
              <span class="mr-2.5 font-mono text-accent">›</span>
              <span>Select an active conversation to send a message.</span>
            </div>
            <button
              class="rounded-lg border border-disabled-border bg-disabled-surface px-3.5 py-2 text-disabled max-[760px]:hidden"
              type="button"
              disabled
            >
              Send
            </button>
          </div>
        }
      >
        {(sessionId) => <SessionChat state={props.state.chatCreate(sessionId)} />}
      </Show>
    </>
  )
}

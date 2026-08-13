import { For, Match, Show, Switch } from "solid-js"
import type { SessionNavigationState } from "./sessionNavigationStateCreate.js"
import { selectedSessionStateCreate } from "./selectedSessionStateCreate.js"
import { SessionChat } from "./SessionChat.js"

export function SelectedSession(props: { navigation: SessionNavigationState }) {
  const state = selectedSessionStateCreate(() => props.navigation)

  return (
    <>
      <Switch>
        <Match when={!state.hasSelection()}>
          <div class="w-[min(620px,calc(100%-48px))] self-center justify-self-center overflow-y-auto py-[54px] text-center max-[760px]:w-[calc(100%-32px)] max-[760px]:max-w-[560px] max-[760px]:py-10">
            <div
              class="relative mx-auto mb-[30px] grid size-[82px] rotate-[-2deg] place-items-center rounded-3xl border border-[#4b5731] bg-gradient-to-br from-[#22271a] to-[#171914] font-mono text-xl text-[#d8ff72] shadow-[0_26px_70px_rgb(0_0_0_/_30%),inset_0_0_30px_rgb(216_255_114_/_4%)] after:absolute after:inset-2 after:rounded-[17px] after:border after:border-[rgb(216_255_114_/_8%)] max-[760px]:mb-[25px] max-[760px]:size-[70px] max-[760px]:rounded-[21px]"
              aria-hidden="true"
            >
              <span>&gt;_</span>
            </div>
            <p class="mb-[9px] font-mono text-[10px] font-bold tracking-[0.14em] text-[#d8ff72] uppercase">
              Conversations
            </p>
            <h2 class="m-0 text-[clamp(28px,4vw,44px)] font-semibold leading-[1.08] tracking-[-0.045em]">
              Select a session
            </h2>
            <p class="mx-auto mt-[18px] mb-0 max-w-[540px] text-sm leading-[1.7] text-[#969b8d] max-[760px]:text-[13px]">
              Choose an active conversation to read its finalized messages.
            </p>
          </div>
        </Match>
        <Match when={state.isSessionError()}>
          <div
            class="w-[min(560px,calc(100%-48px))] self-center justify-self-center text-center text-[13px] text-[#969b8d]"
            role="alert"
          >
            <p>Selected conversation is unavailable.</p>
            <button
              class="rounded-[7px] border border-[#546333] bg-[#2b341c] px-3 py-[7px] text-[#d8ff72]"
              type="button"
              onClick={state.retrySession}
            >
              Retry
            </button>
          </div>
        </Match>
        <Match when={state.isSessionLoading() || !state.session()}>
          <div
            class="w-[min(560px,calc(100%-48px))] self-center justify-self-center text-center text-[13px] text-[#969b8d]"
            role="status"
          >
            Loading conversation...
          </div>
        </Match>
        <Match when={state.session()} keyed>
          {(session) => (
            <div class="min-h-0 overflow-y-auto px-[clamp(24px,6vw,84px)] pt-[38px] pb-[52px] max-[760px]:px-4 max-[760px]:pt-7 max-[760px]:pb-10">
              <header class="mx-auto mb-[34px] w-[min(760px,100%)] border-[#25281f] border-b pb-[22px]">
                <p class="mb-[9px] font-mono text-[10px] font-bold tracking-[0.14em] text-[#d8ff72] uppercase">
                  Conversation
                </p>
                <h2 class="m-0 text-[clamp(24px,3vw,36px)] font-semibold tracking-[-0.035em]">{session.title}</h2>
              </header>

              <Switch>
                <Match when={state.isMessagesError()}>
                  <div
                    class="w-[min(560px,calc(100%-48px))] self-center justify-self-center text-center text-[13px] text-[#969b8d]"
                    role="alert"
                  >
                    <p>Finalized messages are unavailable.</p>
                    <button
                      class="rounded-[7px] border border-[#546333] bg-[#2b341c] px-3 py-[7px] text-[#d8ff72]"
                      type="button"
                      onClick={state.retryMessages}
                    >
                      Retry
                    </button>
                  </div>
                </Match>
                <Match when={state.isMessagesLoading()}>
                  <div
                    class="w-[min(560px,calc(100%-48px))] self-center justify-self-center text-center text-[13px] text-[#969b8d]"
                    role="status"
                  >
                    Loading messages...
                  </div>
                </Match>
                <Match when={state.isMessagesEmpty()}>
                  <div class="w-[min(560px,calc(100%-48px))] self-center justify-self-center text-center text-[13px] text-[#969b8d]">
                    No finalized messages yet.
                  </div>
                </Match>
                <Match when={true}>
                  <ol class="mx-auto grid w-[min(760px,100%)] list-none gap-6 m-0 p-0" aria-label="Finalized messages">
                    <For each={state.messages()}>
                      {(message) => (
                        <li
                          class="border-l-2 border-[#657838] pl-4"
                          classList={{ "!border-[#454a3d]": message.role === "assistant" }}
                        >
                          <span
                            class="font-mono text-[10px] font-bold tracking-[0.12em] text-[#d8ff72] uppercase"
                            classList={{ "!text-[#9da392]": message.role === "assistant" }}
                          >
                            {message.role}
                          </span>
                          <p class="mt-2 mb-0 overflow-wrap-anywhere whitespace-pre-wrap text-sm leading-[1.75] text-[#d7d9d1]">
                            {message.content}
                          </p>
                        </li>
                      )}
                    </For>
                  </ol>
                </Match>
              </Switch>

              <Show when={state.isMessagesRefreshing()}>
                <span
                  class="mx-auto mt-[18px] block w-[min(760px,100%)] font-mono text-[9px] text-[#686d61]"
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
        when={state.session()?.id}
        keyed
        fallback={
          <div
            class="mx-7 mb-6 flex min-h-[74px] items-center justify-between gap-5 rounded-xl border border-[#30342a] bg-[#1c1f19] p-3 pl-[17px] text-[13px] text-[#777d70] shadow-[0_18px_48px_rgb(0_0_0_/_18%)] max-[760px]:mx-3.5 max-[760px]:mb-3.5 max-[760px]:min-h-[66px]"
            aria-label="Chat composer unavailable"
          >
            <div>
              <span class="mr-2.5 font-mono text-[#d8ff72]">›</span>
              <span>Select an active conversation to send a message.</span>
            </div>
            <button
              class="rounded-lg border border-[#3a4032] bg-[#292d24] px-3.5 py-2 text-[#6f7468] max-[760px]:hidden"
              type="button"
              disabled
            >
              Send
            </button>
          </div>
        }
      >
        {(sessionId) => <SessionChat sessionId={sessionId} durableMessages={state.messages} />}
      </Show>
    </>
  )
}

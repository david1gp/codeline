import { For, Match, Show, Switch } from "solid-js"
import type { SessionNavigationState } from "./sessionNavigationStateCreate.js"
import { selectedSessionStateCreate } from "./selectedSessionStateCreate.js"

export function SelectedSession(props: { navigation: SessionNavigationState }) {
  const state = selectedSessionStateCreate(() => props.navigation)

  return (
    <Switch>
      <Match when={!state.hasSelection()}>
        <div class="empty-workspace">
          <div class="empty-symbol" aria-hidden="true">
            <span>&gt;_</span>
          </div>
          <p class="eyebrow">Conversations</p>
          <h2>Select a session</h2>
          <p class="empty-copy">Choose an active conversation to read its finalized messages.</p>
        </div>
      </Match>
      <Match when={state.isSessionError()}>
        <div class="conversation-status" role="alert">
          <p>Selected conversation is unavailable.</p>
          <button type="button" onClick={state.retrySession}>
            Retry
          </button>
        </div>
      </Match>
      <Match when={state.isSessionLoading() || !state.session()}>
        <div class="conversation-status" role="status">
          Loading conversation...
        </div>
      </Match>
      <Match when={state.session()} keyed>
        {(session) => (
          <div class="conversation">
            <header class="conversation-header">
              <p class="eyebrow">Conversation</p>
              <h2>{session.title}</h2>
            </header>

            <Switch>
              <Match when={state.isMessagesError()}>
                <div class="conversation-status" role="alert">
                  <p>Finalized messages are unavailable.</p>
                  <button type="button" onClick={state.retryMessages}>
                    Retry
                  </button>
                </div>
              </Match>
              <Match when={state.isMessagesLoading()}>
                <div class="conversation-status" role="status">
                  Loading messages...
                </div>
              </Match>
              <Match when={state.isMessagesEmpty()}>
                <div class="conversation-status">No finalized messages yet.</div>
              </Match>
              <Match when={true}>
                <ol class="message-list" aria-label="Finalized messages">
                  <For each={state.messages()}>
                    {(message) => (
                      <li class="message" classList={{ "message-assistant": message.role === "assistant" }}>
                        <span class="message-role">{message.role}</span>
                        <p>{message.content}</p>
                      </li>
                    )}
                  </For>
                </ol>
              </Match>
            </Switch>

            <Show when={state.isMessagesRefreshing()}>
              <span class="conversation-refreshing" role="status">
                Updating messages...
              </span>
            </Show>
          </div>
        )}
      </Match>
    </Switch>
  )
}

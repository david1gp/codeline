import { For, Match, Show, Switch } from "solid-js"
import type { SessionNavigationState } from "./sessionNavigationStateCreate.js"
import { sessionListStateCreate } from "./sessionListStateCreate.js"

export function SessionList(props: { navigation: SessionNavigationState }) {
  const state = sessionListStateCreate(() => props.navigation)

  return (
    <div class="session-list" id="activity">
      <p class="section-label">Conversations</p>
      <Switch>
        <Match when={state.isError()}>
          <div class="session-list-status" role="alert">
            <span>Couldn't load conversations.</span>
            <button type="button" onClick={state.retry}>
              Retry
            </button>
          </div>
        </Match>
        <Match when={state.isLoading()}>
          <div class="session-list-status" role="status">
            Loading conversations...
          </div>
        </Match>
        <Match when={state.isEmpty()}>
          <div class="session-list-status">No active conversations.</div>
        </Match>
        <Match when={true}>
          <ul class="session-items" aria-label="Active conversations">
            <For each={state.sessions()}>
              {(session) => (
                <li>
                  <button
                    type="button"
                    class="session-item"
                    classList={{ "session-item-selected": state.isSelected(session.id) }}
                    aria-current={state.isSelected(session.id) ? "page" : undefined}
                    onClick={() => state.selectSession(session.id)}
                  >
                    <span>{session.title}</span>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Match>
      </Switch>
      <Show when={state.isRefreshing()}>
        <span class="session-list-refreshing" role="status">
          Updating conversations...
        </span>
      </Show>
    </div>
  )
}

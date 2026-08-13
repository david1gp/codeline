import { For, Match, Show, Switch } from "solid-js"
import type { SessionNavigationState } from "./sessionNavigationStateCreate.js"
import { sessionListStateCreate } from "./sessionListStateCreate.js"

export function SessionList(props: { navigation: SessionNavigationState }) {
  const state = sessionListStateCreate(() => props.navigation)

  return (
    <div class="mt-[38px] flex-1" id="activity">
      <p class="mb-[9px] font-mono text-[10px] font-bold tracking-[0.14em] text-[#777d6e] uppercase">Conversations</p>
      <label class="relative mb-3 block" for="session-search">
        <span class="sr-only">Search conversations</span>
        <input
          id="session-search"
          class="w-full rounded-[9px] border border-[#30342a] bg-[#1c1f19] px-3 py-2.5 text-xs text-[#ebece5] outline-none placeholder:text-[#686d61] focus:border-[#768d3d] focus:ring-2 focus:ring-[#d8ff72]/20"
          type="search"
          value={state.query()}
          placeholder="Search conversations"
          autocomplete="off"
          onInput={(event) => state.updateQuery(event.currentTarget.value)}
        />
      </label>
      <Switch>
        <Match when={state.isError()}>
          <div
            class="flex items-center justify-between gap-2.5 rounded-[9px] border border-dashed border-[#30342a] p-3.5 text-xs leading-[1.5] text-[#71766a]"
            role="alert"
          >
            <span>Couldn't load conversations.</span>
            <button class="border-0 bg-transparent p-0 text-[11px] text-[#d8ff72]" type="button" onClick={state.retry}>
              Retry
            </button>
          </div>
        </Match>
        <Match when={state.isLoading()}>
          <div
            class="rounded-[9px] border border-dashed border-[#30342a] p-3.5 text-xs leading-[1.5] text-[#71766a]"
            role="status"
          >
            Loading conversations...
          </div>
        </Match>
        <Match when={state.isEmpty()}>
          <div class="rounded-[9px] border border-dashed border-[#30342a] p-3.5 text-xs leading-[1.5] text-[#71766a]">
            {state.emptyMessage()}
          </div>
        </Match>
        <Match when={true}>
          <ul class="m-0 grid list-none gap-1 p-0" aria-label="Active conversations">
            <For each={state.sessions()}>
              {(session) => (
                <li>
                  <button
                    type="button"
                    class="w-full overflow-hidden rounded-lg border border-transparent bg-transparent px-[11px] py-2.5 text-left text-xs leading-[1.4] text-[#a4a99c] transition-colors duration-150 hover:bg-[#1c1f19] hover:text-[#ebece5]"
                    classList={{ "border-[#46532c] bg-[#2b341c] text-[#d8ff72]": state.isSelected(session.id) }}
                    aria-current={state.isSelected(session.id) ? "page" : undefined}
                    onClick={() => state.selectSession(session.id)}
                  >
                    <span class="block overflow-hidden text-ellipsis whitespace-nowrap">{session.title}</span>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Match>
      </Switch>
      <Show when={state.isRefreshing()}>
        <span class="mt-2 block font-mono text-[9px] text-[#686d61]" role="status">
          Updating conversations...
        </span>
      </Show>
    </div>
  )
}

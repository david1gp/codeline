import { For, Match, Show, Switch } from "solid-js"
import { sessionListStateCreate } from "./sessionListStateCreate.js"
import type { SessionNavigationState } from "./sessionNavigationStateCreate.js"

type SessionListState = ReturnType<typeof sessionListStateCreate>
type SessionBranchTreeNode = ReturnType<SessionListState["roots"]>[number]

function SessionBranchNodes(props: {
  ancestry: readonly string[]
  depth?: number
  isSelected: SessionListState["isSelected"]
  nodes: readonly SessionBranchTreeNode[]
  selectSession: SessionListState["selectSession"]
}) {
  const depth = () => props.depth ?? 0

  return (
    <For each={props.nodes}>
      {(node) => {
        const isLeaf = () => node.children.length === 0
        const isAncestor = () => props.ancestry.includes(node.session.id)
        return (
          <li>
            <button
              type="button"
              class="relative w-full overflow-hidden rounded-lg border border-transparent bg-transparent py-2.5 pr-[11px] text-left text-xs leading-[1.4] text-[#a4a99c] transition-colors duration-150 hover:bg-[#1c1f19] hover:text-[#ebece5] disabled:cursor-default disabled:hover:bg-transparent"
              classList={{
                "border-[#46532c] bg-[#2b341c] text-[#d8ff72]": props.isSelected(node.session.id),
                "text-[#c5c9bc]": isAncestor() && !props.isSelected(node.session.id),
              }}
              style={{ "padding-left": `${11 + depth() * 14}px` }}
              disabled={!isLeaf()}
              aria-current={props.isSelected(node.session.id) ? "page" : undefined}
              aria-label={`${node.session.title}${isLeaf() ? "" : ", branch"}`}
              onClick={() => props.selectSession(node.session.id)}
            >
              <Show when={depth() > 0}>
                <span
                  class="absolute top-0 bottom-0 border-[#3b4035] border-l"
                  style={{ left: `${17 + (depth() - 1) * 14}px` }}
                  aria-hidden="true"
                />
              </Show>
              <span class="block overflow-hidden text-ellipsis whitespace-nowrap">{node.session.title}</span>
            </button>
            <Show when={node.children.length > 0}>
              <ul class="m-0 grid list-none gap-1 p-0">
                <SessionBranchNodes
                  ancestry={props.ancestry}
                  depth={depth() + 1}
                  isSelected={props.isSelected}
                  nodes={node.children}
                  selectSession={props.selectSession}
                />
              </ul>
            </Show>
          </li>
        )
      }}
    </For>
  )
}

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
            <SessionBranchNodes
              ancestry={state.selectedAncestry()}
              isSelected={state.isSelected}
              nodes={state.roots()}
              selectSession={state.selectSession}
            />
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

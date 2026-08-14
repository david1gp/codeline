import { For, Match, Show, Switch } from "solid-js"
import type { SessionListState } from "./sessionListStateCreate.js"

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
              class="relative w-full overflow-hidden rounded-lg border border-transparent bg-transparent py-2.5 pr-[11px] text-left text-xs leading-[1.4] text-faint transition-colors duration-150 hover:bg-surface-raised hover:text-strong disabled:cursor-default disabled:hover:bg-transparent"
              classList={{
                "border-accent-border bg-accent-soft text-accent": props.isSelected(node.session.id),
                "text-subtle": isAncestor() && !props.isSelected(node.session.id),
              }}
              style={{ "padding-left": `${11 + depth() * 14}px` }}
              disabled={!isLeaf()}
              aria-current={props.isSelected(node.session.id) ? "page" : undefined}
              aria-label={`${node.session.title}${isLeaf() ? "" : ", branch"}`}
              onClick={() => props.selectSession(node.session.id)}
            >
              <Show when={depth() > 0}>
                <span
                  class="absolute top-0 bottom-0 border-line-strong border-l"
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

export function SessionList(props: { idPrefix?: string; state: SessionListState; onSessionSelect?: () => void }) {
  const searchId = () => `${props.idPrefix ?? "session"}-search`
  const activityId = () => (props.idPrefix === undefined ? "activity" : `${props.idPrefix}-activity`)
  const selectSession = (sessionId: string) => {
    props.state.selectSession(sessionId)
    if (props.state.isSelected(sessionId)) props.onSessionSelect?.()
  }

  return (
    <div class="mt-[38px] flex-1" id={activityId()}>
      <p class="mb-[9px] font-mono text-[10px] font-bold tracking-[0.14em] text-faint uppercase">Conversations</p>
      <label class="relative mb-3 block" for={searchId()}>
        <span class="sr-only">Search conversations</span>
        <input
          id={searchId()}
          class="w-full rounded-[9px] border border-line bg-surface-raised px-3 py-2.5 text-xs text-strong outline-none placeholder:text-placeholder focus:border-accent-border focus:ring-2 focus:ring-accent/20"
          type="search"
          value={props.state.query()}
          placeholder="Search conversations"
          autocomplete="off"
          onInput={(event) => props.state.updateQuery(event.currentTarget.value)}
        />
      </label>
      <Switch>
        <Match when={props.state.isError()}>
          <div
            class="flex items-center justify-between gap-2.5 rounded-[9px] border border-dashed border-line p-3.5 text-xs leading-[1.5] text-disabled"
            role="alert"
          >
            <span>Couldn't load conversations.</span>
            <button
              class="border-0 bg-transparent p-0 text-[11px] text-accent"
              type="button"
              onClick={props.state.retry}
            >
              Retry
            </button>
          </div>
        </Match>
        <Match when={props.state.isLoading()}>
          <div
            class="rounded-[9px] border border-dashed border-line p-3.5 text-xs leading-[1.5] text-disabled"
            role="status"
          >
            Loading conversations...
          </div>
        </Match>
        <Match when={props.state.isEmpty()}>
          <div class="rounded-[9px] border border-dashed border-line p-3.5 text-xs leading-[1.5] text-disabled">
            {props.state.emptyMessage()}
          </div>
        </Match>
        <Match when={true}>
          <ul class="m-0 grid list-none gap-1 p-0" aria-label="Active conversations">
            <SessionBranchNodes
              ancestry={props.state.selectedAncestry()}
              isSelected={props.state.isSelected}
              nodes={props.state.roots()}
              selectSession={selectSession}
            />
          </ul>
        </Match>
      </Switch>
      <Show when={props.state.isRefreshing()}>
        <span class="mt-2 block font-mono text-[9px] text-placeholder" role="status">
          Updating conversations...
        </span>
      </Show>
    </div>
  )
}

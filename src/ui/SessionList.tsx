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
              class="flex h-[54px] w-full items-center gap-1.5 overflow-hidden border-0 border-transparent border-l-2 bg-transparent pr-2 text-left text-xs leading-[1.4] text-faint transition-colors duration-100 hover:bg-surface-hover hover:text-strong disabled:cursor-default disabled:hover:bg-transparent"
              classList={{
                "border-l-accent bg-[var(--bg-selected)] font-medium text-strong": props.isSelected(node.session.id),
                "text-subtle": isAncestor() && !props.isSelected(node.session.id),
              }}
              style={{ "padding-left": `${12 + depth() * 12}px` }}
              disabled={!isLeaf()}
              aria-current={props.isSelected(node.session.id) ? "page" : undefined}
              aria-label={`${node.session.title}${isLeaf() ? "" : ", branch"}`}
              onClick={() => props.selectSession(node.session.id)}
            >
              <Show when={depth() > 0}>
                <svg
                  class="shrink-0 text-placeholder"
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M6 3v12" />
                  <circle cx="18" cy="6" r="3" />
                  <circle cx="6" cy="18" r="3" />
                  <path d="M18 9a9 9 0 0 1-9 9" />
                </svg>
              </Show>
              <span class="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap" title={node.session.title}>
                {node.session.title}
              </span>
            </button>
            <Show when={node.children.length > 0}>
              <ul class="m-0 list-none p-0">
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
    <div class="flex min-h-0 flex-1 flex-col" id={activityId()}>
      <label class="relative shrink-0 border-line border-b p-2.5" for={searchId()}>
        <span class="sr-only">Search conversations</span>
        <svg
          class="pointer-events-none absolute top-1/2 left-5 -translate-y-1/2 text-placeholder"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </svg>
        <input
          id={searchId()}
          class="h-8 w-full rounded-[7px] border border-line bg-surface-raised pr-2.5 pl-8 text-xs text-strong outline-none placeholder:text-placeholder focus:border-accent-border"
          type="search"
          value={props.state.query()}
          placeholder="Search conversations"
          autocomplete="off"
          onInput={(event) => props.state.updateQuery(event.currentTarget.value)}
        />
      </label>
      <div class="min-h-0 flex-1 overflow-y-auto">
        <Switch>
          <Match when={props.state.isError()}>
            <div
              class="flex items-center justify-between gap-2.5 px-3.5 py-4 text-xs leading-[1.5] text-danger"
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
            <div class="px-3.5 py-4 text-xs leading-[1.5] text-faint" role="status">
              Loading conversations...
            </div>
          </Match>
          <Match when={props.state.isEmpty()}>
            <div class="px-3.5 py-4 text-xs leading-[1.5] text-faint">{props.state.emptyMessage()}</div>
          </Match>
          <Match when={true}>
            <ul class="m-0 list-none p-0" aria-label="Active conversations">
              <SessionBranchNodes
                ancestry={props.state.selectedAncestry()}
                isSelected={props.state.isSelected}
                nodes={props.state.roots()}
                selectSession={selectSession}
              />
            </ul>
          </Match>
        </Switch>
      </div>
    </div>
  )
}

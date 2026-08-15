import { mdiEyeOutline, mdiFolderMultipleOutline, mdiHistory, mdiMagnify } from "@mdi/js"
import { For, Match, Show, Switch } from "solid-js"
import { Input } from "#ui/input/input/Input.jsx"
import { Button } from "#ui/interactive/button/Button.jsx"
import { ButtonIconOnly } from "#ui/interactive/button/ButtonIconOnly.jsx"
import { Icon } from "#ui/static/icon/Icon.jsx"
import type { SessionListState } from "./sessionListStateCreate.js"
import type { SessionSidebarTab } from "./sessionSidebarTab.js"

const tabs: ReadonlyArray<{ icon: string; label: string; value: SessionSidebarTab }> = [
  { icon: mdiHistory, label: "Recent", value: "recent" },
  { icon: mdiEyeOutline, label: "Watched", value: "watched" },
  { icon: mdiFolderMultipleOutline, label: "Projects", value: "projects" },
  { icon: mdiMagnify, label: "Search", value: "search" },
]

type SessionRow = ReturnType<SessionListState["sidebar"]["tabs"]>["recent"][number]

function SessionRows(props: {
  isSelected: SessionListState["isSelected"]
  rows: readonly SessionRow[]
  selectSession: (sessionId: string) => void
}) {
  return (
    <ul class="m-0 list-none p-0" aria-label="Active conversations">
      <For each={props.rows}>
        {(row) => (
          <li>
            <button
              type="button"
              class="flex min-h-[54px] w-full min-w-0 flex-col justify-center overflow-hidden border-0 border-transparent border-l-2 bg-transparent px-3 py-2 text-left transition-colors duration-100 hover:bg-surface-hover"
              classList={{
                "border-l-accent bg-[var(--bg-selected)]": props.isSelected(row.session.id),
              }}
              aria-current={props.isSelected(row.session.id) ? "page" : undefined}
              onClick={() => props.selectSession(row.session.id)}
            >
              <span
                class="block w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-medium text-strong"
                title={row.session.title}
              >
                {row.session.title}
              </span>
              <span class="mt-0.5 flex w-full min-w-0 items-center gap-1.5 text-[11px] text-faint">
                <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{row.projectLabel}</span>
                <span aria-hidden="true">·</span>
                <time
                  class="shrink-0"
                  datetime={new Date(row.session.updatedAt).toISOString()}
                  title={row.updatedAtTitle}
                >
                  {row.updatedAtRelative}
                </time>
              </span>
            </button>
          </li>
        )}
      </For>
    </ul>
  )
}

export function SessionList(props: { idPrefix?: string; state: SessionListState; onSessionSelect?: () => void }) {
  const prefix = () => props.idPrefix ?? "session"
  const searchId = () => `${prefix()}-search`
  const selectSession = (sessionId: string) => {
    props.state.selectSession(sessionId)
    if (props.state.isSelected(sessionId)) props.onSessionSelect?.()
  }

  return (
    <div
      class="flex min-h-0 flex-1 flex-col"
      id={props.idPrefix === undefined ? "activity" : `${props.idPrefix}-activity`}
    >
      <div class="grid shrink-0 grid-cols-4 gap-1 border-line border-b p-2" role="tablist" aria-label="Session views">
        <For each={tabs}>
          {(tab) => (
            <ButtonIconOnly
              class="h-9 w-full min-w-0 rounded-md text-faint hover:bg-surface-hover hover:text-strong data-[state=active]:bg-[var(--bg-selected)] data-[state=active]:text-accent"
              icon={tab.icon}
              iconClass="size-4"
              id={`${prefix()}-${tab.value}-tab`}
              role="tab"
              title={tab.label}
              aria-controls={`${prefix()}-${tab.value}-panel`}
              aria-label={tab.label}
              aria-selected={props.state.sidebar.activeTab() === tab.value}
              data-state={props.state.sidebar.activeTab() === tab.value ? "active" : "inactive"}
              onClick={() => props.state.sidebar.selectTab(tab.value)}
            />
          )}
        </For>
      </div>

      <Show when={props.state.sidebar.activeTab() === "search"}>
        <label class="relative shrink-0 border-line border-b p-2.5" for={searchId()}>
          <span class="sr-only">Search conversations</span>
          <Icon
            path={mdiMagnify}
            class="pointer-events-none absolute top-1/2 left-5 size-[13px] -translate-y-1/2 fill-current text-placeholder dark:fill-current"
          />
          <Input
            id={searchId()}
            class="h-8 w-full rounded-[7px] border border-line bg-surface-raised pr-2.5 pl-8 text-xs text-strong outline-none placeholder:text-placeholder focus:border-accent-border"
            type="search"
            value={props.state.query()}
            placeholder="Search conversations"
            autocomplete="off"
            onInput={(event) => props.state.updateQuery(event.currentTarget.value)}
          />
        </label>
      </Show>

      <div
        class="min-h-0 flex-1 overflow-y-auto"
        id={`${prefix()}-${props.state.sidebar.activeTab()}-panel`}
        role="tabpanel"
        aria-labelledby={`${prefix()}-${props.state.sidebar.activeTab()}-tab`}
      >
        <Switch>
          <Match when={props.state.isError()}>
            <div
              class="flex items-center justify-between gap-2.5 px-3.5 py-4 text-xs leading-[1.5] text-danger"
              role="alert"
            >
              <span>Couldn't load conversations.</span>
              <Button
                variant="none"
                size="none"
                class="border-0 bg-transparent p-0 text-[11px] text-accent"
                onClick={props.state.retry}
              >
                Retry
              </Button>
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
          <Match when={props.state.sidebar.activeTab() === "projects"}>
            <div class="py-1">
              <For each={props.state.sidebar.projectGroups()}>
                {(project) => (
                  <details class="group" open={project.sessions.some((row) => props.state.isSelected(row.session.id))}>
                    <summary class="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 text-xs font-semibold text-strong hover:bg-surface-hover">
                      <Icon
                        path={mdiFolderMultipleOutline}
                        class="size-4 shrink-0 fill-current text-faint dark:fill-current"
                      />
                      <span
                        class="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
                        title={project.projectPath}
                      >
                        {project.projectLabel}
                      </span>
                      <span class="shrink-0 text-[11px] font-normal text-faint">{project.sessions.length}</span>
                    </summary>
                    <div class="ml-3 border-line-subtle border-l">
                      <SessionRows
                        rows={project.sessions}
                        isSelected={props.state.isSelected}
                        selectSession={selectSession}
                      />
                    </div>
                  </details>
                )}
              </For>
            </div>
          </Match>
          <Match when={true}>
            <SessionRows
              rows={props.state.sidebar.activeRows()}
              isSelected={props.state.isSelected}
              selectSession={selectSession}
            />
          </Match>
        </Switch>
      </div>
    </div>
  )
}

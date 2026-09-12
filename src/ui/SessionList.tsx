import { mdiFolderMultipleOutline } from "@adaptive-ds/mdi/mdiFolderMultipleOutline.js"
import { mdiFolderPlusOutline } from "@adaptive-ds/mdi/mdiFolderPlusOutline.js"
import { mdiHistory } from "@adaptive-ds/mdi/mdiHistory.js"
import { mdiMagnify } from "@adaptive-ds/mdi/mdiMagnify.js"
import { mdiPinOutline } from "@adaptive-ds/mdi/mdiPinOutline.js"
import { For, Match, Show, Switch } from "solid-js"
import { Input } from "#ui/input/input/Input.jsx"
import { Button } from "#ui/interactive/button/Button.jsx"
import { ButtonIconOnly } from "#ui/interactive/button/ButtonIconOnly.jsx"
import { buttonVariant } from "#ui/interactive/button/buttonCva.js"
import { Icon } from "#ui/static/icon/Icon.jsx"
import { projectFolderIconSelect } from "../project/ui/projectFolderIconSelect.js"
import type { ProjectRegistryState } from "../project/ui/projectRegistryState.js"
import type { ActiveProjectState } from "./activeProjectStateCreate.js"
import { NewProjectDialog } from "./NewProjectDialog.js"
import { ProjectRow } from "./ProjectRow.js"
import { SessionSidebarDialogs } from "./SessionSidebarDialogs.js"
import { SessionSidebarMenu } from "./SessionSidebarMenu.js"
import type { SessionListState } from "./sessionListStateCreate.js"
import type { SessionProjectTarget } from "./sessionProjectTarget.js"
import type { SessionSidebarTab } from "./sessionSidebarTab.js"

const tabs: ReadonlyArray<{ icon: string; label: string; value: SessionSidebarTab }> = [
  { icon: mdiPinOutline, label: "Pinned", value: "pinned" },
  { icon: mdiFolderMultipleOutline, label: "Projects", value: "projects" },
  { icon: mdiHistory, label: "Recent", value: "recent" },
  { icon: mdiMagnify, label: "Search", value: "search" },
]

export function SessionList(props: {
  activeProject: ActiveProjectState
  idPrefix?: string
  onSessionSelect?: () => void
  projectRegistry?: ProjectRegistryState
  sessionNewInProject?: (target: SessionProjectTarget) => void
  sessionCreateInProject?: (target: SessionProjectTarget) => void
  state: SessionListState
}) {
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

      <Show when={props.state.sidebar.activeTab() === "projects"}>
        <div class="flex items-center gap-1.5 shrink-0 border-line border-b p-2">
          <div class="min-w-0 flex-1">
            <NewProjectDialog
              activeProject={props.activeProject}
              idPrefix={`${prefix()}-new-project`}
              projectRegistry={props.projectRegistry ?? props.state.projectRegistry}
            />
          </div>
          <Button
            class="h-8 shrink-0 px-2 text-xs font-normal text-faint hover:bg-surface-hover hover:text-strong"
            variant={buttonVariant.ghost}
            title="New folder"
            aria-label="New folder"
            onClick={() => props.state.actions.folderCreateOpen()}
          >
            <Icon path={mdiFolderPlusOutline} class="mr-1 size-3.5" />
            New Folder
          </Button>
        </div>
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
          <Match when={true}>
            <div class="py-1">
              <For each={props.state.sidebar.folders()}>
                {(folder) => (
                  <details
                    class="group/folder"
                    open={props.state.folderIsOpen(folder)}
                    onToggle={(event) => {
                      if (event.target === event.currentTarget) {
                        props.state.folderToggle(folder.id, event.currentTarget.open)
                      }
                    }}
                  >
                    <summary class="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 text-xs font-semibold text-strong hover:bg-surface-hover">
                      <Icon
                        path={projectFolderIconSelect(props.state.folderIsOpen(folder))}
                        class="size-4 shrink-0 text-faint"
                      />
                      <span class="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap" title={folder.label}>
                        {folder.label}
                      </span>
                      <Show when={folder.active || folder.unseenEnded}>
                        <span
                          class="size-2 shrink-0 rounded-full"
                          classList={{
                            "bg-emerald-500": folder.active,
                            "bg-blue-500": !folder.active && folder.unseenEnded,
                          }}
                          title={folder.active ? "Active session in folder" : "Unseen ended session in folder"}
                          role="status"
                          aria-label={folder.active ? "Active session in folder" : "Unseen ended session in folder"}
                        />
                      </Show>
                      <Show when={props.state.sidebar.showsManagementControls()}>
                        <SessionSidebarMenu
                          ariaLabel={`Folder actions for ${folder.label}`}
                          deleteLabel="Delete"
                          onRename={() => props.state.actions.folderRenameOpen(folder)}
                          onDelete={() => props.state.actions.folderDeleteOpen(folder)}
                        />
                      </Show>
                    </summary>
                    <Show when={folder.projects.length > 0}>
                      <div class="ml-3 border-line-subtle border-l">
                        <For each={folder.projects}>
                          {(project) => (
                            <ProjectRow
                              project={project}
                              selectSession={selectSession}
                              sessionNewInProject={props.sessionNewInProject}
                              sessionCreateInProject={props.sessionCreateInProject}
                              state={props.state}
                            />
                          )}
                        </For>
                      </div>
                    </Show>
                  </details>
                )}
              </For>

              <For each={props.state.sidebar.uncategorizedProjects()}>
                {(project) => (
                  <ProjectRow
                    project={project}
                    selectSession={selectSession}
                    sessionNewInProject={props.sessionNewInProject}
                    sessionCreateInProject={props.sessionCreateInProject}
                    state={props.state}
                  />
                )}
              </For>
            </div>
          </Match>
        </Switch>
        <Show when={props.state.sidebar.activeTab() !== "search" && props.state.sidebar.canLoadMore()}>
          <div class="flex justify-center border-line border-t p-2">
            <Button
              variant="none"
              size="none"
              class="px-2 py-1 text-[11px] text-accent"
              disabled={props.state.sidebar.isLoadingMore()}
              onClick={props.state.sidebar.loadMore}
            >
              {props.state.sidebar.isLoadingMore() ? "Loading..." : "Load more"}
            </Button>
          </div>
        </Show>
      </div>
      <SessionSidebarDialogs actions={props.state.actions} />
    </div>
  )
}

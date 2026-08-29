import { mdiFolderMultipleOutline } from "@adaptive-ds/mdi/mdiFolderMultipleOutline.js"
import { mdiFolderOutline } from "@adaptive-ds/mdi/mdiFolderOutline.js"
import { mdiFolderPlusOutline } from "@adaptive-ds/mdi/mdiFolderPlusOutline.js"
import { mdiHistory } from "@adaptive-ds/mdi/mdiHistory.js"
import { mdiLoading } from "@adaptive-ds/mdi/mdiLoading.js"
import { mdiMagnify } from "@adaptive-ds/mdi/mdiMagnify.js"
import { mdiPinOutline } from "@adaptive-ds/mdi/mdiPinOutline.js"
import { mdiPlus } from "@adaptive-ds/mdi/mdiPlus.js"
import { mdiTrashCanOutline } from "@adaptive-ds/mdi/mdiTrashCanOutline.js"
import { For, Match, Show, Switch } from "solid-js"
import { Input } from "#ui/input/input/Input.jsx"
import { Button } from "#ui/interactive/button/Button.jsx"
import { ButtonIconOnly } from "#ui/interactive/button/ButtonIconOnly.jsx"
import { buttonVariant } from "#ui/interactive/button/buttonCva.js"
import { Icon } from "#ui/static/icon/Icon.jsx"
import { ProjectAvatar } from "../project/ui/ProjectAvatar.js"
import type { ProjectRegistryState } from "../project/ui/projectRegistryState.js"
import type { ActiveProjectState } from "./activeProjectStateCreate.js"
import { NewProjectDialog } from "./NewProjectDialog.js"
import { SessionSidebarDialogs } from "./SessionSidebarDialogs.js"
import { SessionSidebarMenu } from "./SessionSidebarMenu.js"
import type { SessionListState } from "./sessionListStateCreate.js"
import type { SessionSidebarTab } from "./sessionSidebarTab.js"

const tabs: ReadonlyArray<{ icon: string; label: string; value: SessionSidebarTab }> = [
  { icon: mdiPinOutline, label: "Pinned", value: "pinned" },
  { icon: mdiFolderMultipleOutline, label: "Projects", value: "projects" },
  { icon: mdiHistory, label: "Recent", value: "recent" },
  { icon: mdiMagnify, label: "Search", value: "search" },
]

type SessionRow = ReturnType<SessionListState["sidebar"]["tabs"]>["recent"][number]

function SessionRows(props: {
  hideProjectLabel?: boolean
  isSelected: SessionListState["isSelected"]
  onSessionDelete: (sessionId: string) => void
  onSessionDeleteImmediate: (sessionId: string) => void
  onSessionRename: (sessionId: string) => void
  rows: readonly SessionRow[]
  selectSession: (sessionId: string) => void
}) {
  return (
    <ul class="m-0 list-none p-0" aria-label="Active conversations">
      <For each={props.rows}>
        {(row) => (
          <li>
            <div
              class="flex min-h-[54px] w-full min-w-0 items-stretch overflow-hidden border-0 border-transparent border-l-2 bg-transparent transition-colors duration-100 hover:bg-surface-hover"
              classList={{
                "border-l-accent bg-[var(--bg-selected)]": props.isSelected(row.session.id),
              }}
            >
              <button
                type="button"
                class="flex min-w-0 flex-1 flex-col justify-center overflow-hidden border-0 bg-transparent px-3 py-2 text-left"
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
                  <Show when={!props.hideProjectLabel}>
                    <ProjectAvatar name={row.projectLabel} class="size-3 text-[8px]" />
                    <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{row.projectLabel}</span>
                    <span aria-hidden="true">·</span>
                  </Show>
                  <Show
                    when={row.session.working}
                    fallback={
                      <time
                        class="shrink-0"
                        datetime={new Date(row.session.updatedAt).toISOString()}
                        title={row.updatedAtTitle}
                      >
                        {row.updatedAtRelative}
                      </time>
                    }
                  >
                    <Icon
                      path={mdiLoading}
                      class="size-3 shrink-0 animate-spin fill-current text-accent dark:fill-current"
                      title="Working"
                    />
                  </Show>
                </span>
              </button>
              <div class="flex items-end pr-2 pb-2">
                <Show
                  when={row.session.title === "New session"}
                  fallback={
                    <SessionSidebarMenu
                      ariaLabel={`Session actions for ${row.session.title}`}
                      onRename={() => props.onSessionRename(row.session.id)}
                      onDelete={() => props.onSessionDelete(row.session.id)}
                    />
                  }
                >
                  <ButtonIconOnly
                    class="size-6 shrink-0 rounded-md text-faint hover:bg-surface-hover hover:text-strong"
                    icon={mdiTrashCanOutline}
                    iconClass="size-3.5 fill-current text-faint dark:fill-current"
                    title={`Delete ${row.session.title}`}
                    aria-label={`Delete ${row.session.title}`}
                    variant={buttonVariant.ghost}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      props.onSessionDeleteImmediate(row.session.id)
                    }}
                  />
                </Show>
              </div>
            </div>
          </li>
        )}
      </For>
    </ul>
  )
}

export function SessionList(props: {
  activeProject: ActiveProjectState
  idPrefix?: string
  onSessionSelect?: () => void
  projectRegistry?: ProjectRegistryState
  sessionCreateInProject?: (projectPath: string, projectId?: string) => void
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
          <Match when={props.state.sidebar.activeTab() === "projects"}>
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
                      <Icon path={mdiFolderOutline} class="size-4 shrink-0 text-faint" />
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
                      <SessionSidebarMenu
                        ariaLabel={`Folder actions for ${folder.label}`}
                        deleteLabel="Delete"
                        onRename={() => props.state.actions.folderRenameOpen(folder)}
                        onDelete={() => props.state.actions.folderDeleteOpen(folder)}
                      />
                    </summary>
                    <Show when={folder.projects.length > 0}>
                      <div class="ml-3 border-line-subtle border-l">
                        <For each={folder.projects}>
                          {(project) => (
                            <details class="group" open={props.state.projectIsOpen(project)}>
                              <summary class="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 text-xs font-semibold text-strong hover:bg-surface-hover">
                                <ProjectAvatar name={project.projectLabel} />
                                <span
                                  class="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
                                  classList={{ "text-faint": project.available === false }}
                                  title={project.projectPath || project.projectLabel}
                                >
                                  {project.projectLabel}
                                  {project.available === false ? " (unavailable)" : ""}
                                </span>
                                <SessionSidebarMenu
                                  ariaLabel={`Project actions for ${project.projectLabel}`}
                                  deleteLabel={project.projectId !== undefined ? "Remove" : "Delete"}
                                  onRename={() => props.state.actions.projectRenameOpen(project)}
                                  onMove={
                                    project.projectId !== undefined
                                      ? () => props.state.actions.projectMoveOpen(project)
                                      : undefined
                                  }
                                  onDelete={() =>
                                    project.projectId !== undefined
                                      ? props.state.actions.projectRemoveOpen(project)
                                      : props.state.actions.projectDeleteOpen(project)
                                  }
                                />
                                <ButtonIconOnly
                                  class="size-6 shrink-0 rounded-md text-faint hover:bg-transparent hover:text-faint disabled:opacity-40"
                                  disabled={project.available === false}
                                  icon={mdiPlus}
                                  iconClass="size-3.5 fill-current text-faint dark:fill-current"
                                  title={
                                    project.available === false
                                      ? `${project.projectLabel} is unavailable`
                                      : `New session in ${project.projectLabel}`
                                  }
                                  aria-label={
                                    project.available === false
                                      ? `${project.projectLabel} is unavailable`
                                      : `New session in ${project.projectLabel}`
                                  }
                                  variant={buttonVariant.ghost}
                                  onClick={(event) => {
                                    event.preventDefault()
                                    event.stopPropagation()
                                    if (project.available === false) return
                                    props.sessionCreateInProject?.(project.projectPath, project.projectId)
                                  }}
                                />
                              </summary>
                              <Show when={project.sessions.length > 0}>
                                <div class="ml-3 border-line-subtle border-l">
                                  <SessionRows
                                    hideProjectLabel
                                    rows={project.sessions}
                                    isSelected={props.state.isSelected}
                                    onSessionDelete={props.state.actions.sessionDeleteOpen}
                                    onSessionDeleteImmediate={(sessionId) =>
                                      void props.state.actions.sessionDeleteImmediate(sessionId)
                                    }
                                    onSessionRename={props.state.actions.sessionRenameOpen}
                                    selectSession={selectSession}
                                  />
                                </div>
                              </Show>
                            </details>
                          )}
                        </For>
                      </div>
                    </Show>
                  </details>
                )}
              </For>

              <For each={props.state.sidebar.uncategorizedProjects()}>
                {(project) => (
                  <details class="group" open={props.state.projectIsOpen(project)}>
                    <summary class="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 text-xs font-semibold text-strong hover:bg-surface-hover">
                      <ProjectAvatar name={project.projectLabel} />
                      <span
                        class="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
                        classList={{ "text-faint": project.available === false }}
                        title={project.projectPath || project.projectLabel}
                      >
                        {project.projectLabel}
                        {project.available === false ? " (unavailable)" : ""}
                      </span>
                      <SessionSidebarMenu
                        ariaLabel={`Project actions for ${project.projectLabel}`}
                        deleteLabel={project.projectId !== undefined ? "Remove" : "Delete"}
                        onRename={() => props.state.actions.projectRenameOpen(project)}
                        onMove={
                          project.projectId !== undefined
                            ? () => props.state.actions.projectMoveOpen(project)
                            : undefined
                        }
                        onDelete={() =>
                          project.projectId !== undefined
                            ? props.state.actions.projectRemoveOpen(project)
                            : props.state.actions.projectDeleteOpen(project)
                        }
                      />
                      <ButtonIconOnly
                        class="size-6 shrink-0 rounded-md text-faint hover:bg-transparent hover:text-faint disabled:opacity-40"
                        disabled={project.available === false}
                        icon={mdiPlus}
                        iconClass="size-3.5 fill-current text-faint dark:fill-current"
                        title={
                          project.available === false
                            ? `${project.projectLabel} is unavailable`
                            : `New session in ${project.projectLabel}`
                        }
                        aria-label={
                          project.available === false
                            ? `${project.projectLabel} is unavailable`
                            : `New session in ${project.projectLabel}`
                        }
                        variant={buttonVariant.ghost}
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          if (project.available === false) return
                          props.sessionCreateInProject?.(project.projectPath, project.projectId)
                        }}
                      />
                    </summary>
                    <Show when={project.sessions.length > 0}>
                      <div class="ml-3 border-line-subtle border-l">
                        <SessionRows
                          hideProjectLabel
                          rows={project.sessions}
                          isSelected={props.state.isSelected}
                          onSessionDelete={props.state.actions.sessionDeleteOpen}
                          onSessionDeleteImmediate={(sessionId) =>
                            void props.state.actions.sessionDeleteImmediate(sessionId)
                          }
                          onSessionRename={props.state.actions.sessionRenameOpen}
                          selectSession={selectSession}
                        />
                      </div>
                    </Show>
                  </details>
                )}
              </For>
            </div>
          </Match>
          <Match when={true}>
            <SessionRows
              rows={props.state.sidebar.activeRows()}
              isSelected={props.state.isSelected}
              onSessionDelete={props.state.actions.sessionDeleteOpen}
              onSessionDeleteImmediate={(sessionId) => void props.state.actions.sessionDeleteImmediate(sessionId)}
              onSessionRename={props.state.actions.sessionRenameOpen}
              selectSession={selectSession}
            />
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

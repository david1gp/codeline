import { For, Match, Show, Switch } from "solid-js"
import { Button } from "#ui/interactive/button/Button.jsx"
import { ButtonIconOnly } from "#ui/interactive/button/ButtonIconOnly.jsx"
import { buttonVariant } from "#ui/interactive/button/buttonCva.js"
import { Icon } from "#ui/static/icon/Icon.jsx"
import { NewProjectDialog } from "../../project/ui/NewProjectDialog.js"
import { applicationIcon } from "../../ui/applicationIcon.js"
import type { WorkspaceScreenView } from "../../ui/workspaceScreenView.js"
import { SessionSidebarDialogs } from "./SessionSidebarDialogs.js"
import { SessionSidebarMenu } from "./SessionSidebarMenu.js"
import { sessionSidebarNewProjectResolve } from "./sessionSidebarNewProjectResolve.js"
import type { sessionSidebarNewStateCreate } from "./sessionSidebarNewStateCreate.js"
import { sessionSidebarProjectGroupLabelResolve } from "./sessionSidebarProjectGroupLabelResolve.js"
import { sessionSidebarProjectLabelResolve } from "./sessionSidebarProjectLabelResolve.js"

type SidebarState = ReturnType<typeof sessionSidebarNewStateCreate>

export function SessionSidebarNew(props: {
  workspace: WorkspaceScreenView
  state: SidebarState
  close?: () => void
  initialFocus?: (element: HTMLElement) => void
  headingId?: string
  mobile?: boolean
}) {
  return (
    <nav class="sessions-workspace-navigation" aria-label="Sessions">
      <div class="sessions-workspace-brand">
        <span class="sessions-workspace-brand-mark" aria-hidden="true">
          C
        </span>
        <span>Codeline</span>
        <span class="sessions-workspace-brand-suffix">Code</span>
        <Show when={props.close}>
          <button
            type="button"
            class="sessions-workspace-close"
            aria-label="Close sessions"
            ref={props.initialFocus}
            onClick={props.close}
          >
            Close
          </button>
        </Show>
      </div>
      <h2 class="sr-only" id={props.headingId}>
        Sessions
      </h2>
      <div class="sessions-workspace-sidebar-actions">
        <button
          type="button"
          onClick={() => {
            props.close?.()
            props.workspace.newSessionDialogOpenChange?.(true)
          }}
        >
          <Icon path={applicationIcon.sessionCreate} class="size-4 shrink-0 fill-current" /> New session
        </button>
      </div>
      <Show when={props.workspace.sessionTargetSelector.sessionCreateStatus() === "error"}>
        <p class="px-3 text-xs text-danger" role="alert">
          The new session could not be created. Try again.
        </p>
      </Show>
      <div class="sessions-workspace-sidebar-heading">
        <span>Threads</span>
        <label class="sessions-workspace-mode-label">
          <input
            type="checkbox"
            checked={props.state.mode() === "projects"}
            onChange={(event) => props.state.modeChange(event.currentTarget.checked ? "projects" : "flat")}
          />
          Group threads by project
        </label>
      </div>
      <section class="sessions-workspace-thread-scroll" aria-label="Conversation list">
        <Switch>
          <Match when={props.workspace.sessionList.newSidebar.isError()}>
            <div class="sessions-workspace-list-message" role="alert">
              Couldn't load conversations.{" "}
              <Button variant="none" size="none" onClick={props.workspace.sessionList.newSidebar.retry}>
                Retry
              </Button>
            </div>
          </Match>
          <Match when={props.workspace.sessionList.newSidebar.isLoading()}>
            <div class="sessions-workspace-list-message" role="status">
              Loading conversations...
            </div>
          </Match>
          <Match when={props.state.sessions().length === 0}>
            <div class="sessions-workspace-list-message">{props.workspace.sessionList.newSidebar.emptyMessage()}</div>
          </Match>
          <Match when={props.state.mode() === "flat"}>
            <ul
              class="sessions-workspace-thread-list"
              aria-label="Threads, draggable to reorder"
              ref={props.state.dragListAttach}
            >
              <For each={props.state.sessions()}>
                {(session) => (
                  <li class="sessions-workspace-thread" data-session-id={session.id}>
                    <button
                      class="sessions-workspace-drag"
                      type="button"
                      aria-label={`Reorder ${session.title}; use up and down arrow keys`}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                          event.preventDefault()
                          props.state.moveBy(session.id, event.key === "ArrowUp" ? -1 : 1)
                        }
                      }}
                    >
                      ⋮⋮
                    </button>
                    <button
                      class="sessions-workspace-thread-link"
                      type="button"
                      aria-current={props.workspace.sessionList.isSelected(session.id) ? "page" : undefined}
                      onClick={() => {
                        props.workspace.sessionList.selectSession(session.id)
                        props.close?.()
                      }}
                      title={session.title}
                    >
                      <span class="sessions-workspace-thread-title">{session.title}</span>
                      <span class="sessions-workspace-thread-project">
                        {sessionSidebarProjectGroupLabelResolve(
                          session,
                          props.workspace.sessionList.sidebar.projectGroups(),
                          sessionSidebarProjectLabelResolve(session.projectPath),
                        )}
                      </span>
                    </button>
                    <SessionSidebarMenu
                      ariaLabel={`Session actions for ${session.title}`}
                      onRename={() => props.workspace.sessionList.actions.sessionRenameOpen(session.id)}
                      onDelete={() => props.workspace.sessionList.actions.sessionDeleteOpen(session.id)}
                    />
                  </li>
                )}
              </For>
            </ul>
          </Match>
          <Match when={true}>
            <ul class="sessions-workspace-thread-list" aria-label="Threads grouped by project">
              <For each={props.state.groups()}>
                {(group) => (
                  <li>
                    {(() => {
                      const label = () =>
                        sessionSidebarProjectGroupLabelResolve(
                          group,
                          props.workspace.sessionList.sidebar.projectGroups(),
                          sessionSidebarProjectLabelResolve(group.projectPath),
                        )
                      const resolved = () =>
                        sessionSidebarNewProjectResolve(group, props.workspace.sessionList.sidebar.projectGroups())
                      return (
                        <div class="sessions-workspace-group-row">
                          <button
                            class="sessions-workspace-group"
                            type="button"
                            title={group.projectPath || label()}
                            aria-label={`${label()} conversations`}
                            aria-expanded={props.state.expanded(group.id)}
                            onClick={() => props.state.groupToggle(group.id)}
                          >
                            <Icon path={applicationIcon.folder} class="size-4 shrink-0 fill-current" />
                            <span class="sessions-workspace-thread-title">{label()}</span>
                            <span class="sessions-workspace-group-count">{group.sessions.length}</span>
                            <span aria-hidden="true">{props.state.expanded(group.id) ? "⌄" : "›"}</span>
                          </button>
                          <Show when={resolved()}>
                            {(match) => (
                              <SessionSidebarMenu
                                ariaLabel={`Project actions for ${label()}`}
                                deleteLabel={group.projectId !== null ? "Remove" : "Delete"}
                                onRename={() => props.workspace.sessionList.actions.projectRenameOpen(match().project)}
                                onMove={
                                  group.projectId !== null
                                    ? () => props.workspace.sessionList.actions.projectMoveOpen(match().project)
                                    : undefined
                                }
                                onDelete={
                                  group.projectId !== null
                                    ? () => props.workspace.sessionList.actions.projectRemoveOpen(match().project)
                                    : match().canDeleteByPath
                                      ? () => props.workspace.sessionList.actions.projectDeleteOpen(match().project)
                                      : undefined
                                }
                              />
                            )}
                          </Show>
                          <ButtonIconOnly
                            class="size-6 shrink-0 rounded-md text-faint hover:bg-surface-hover hover:text-strong disabled:opacity-40"
                            disabled={resolved()?.project.available === false}
                            icon={applicationIcon.sessionCreate}
                            iconClass="size-3.5 fill-current text-faint dark:fill-current"
                            title={
                              resolved()?.project.available === false
                                ? `${label()} is unavailable`
                                : `New session in ${label()}`
                            }
                            aria-label={
                              resolved()?.project.available === false
                                ? `${label()} is unavailable`
                                : `New session in ${label()}`
                            }
                            variant={buttonVariant.ghost}
                            onClick={() => {
                              if (resolved()?.project.available === false) return
                              props.close?.()
                              void props.workspace.sessionTargetSelector.sessionCreateStart(
                                group.projectId === null
                                  ? { kind: "path", projectPath: group.projectPath }
                                  : { kind: "registered", projectId: group.projectId },
                              )
                            }}
                          />
                        </div>
                      )
                    })()}
                    <Show when={props.state.expanded(group.id)}>
                      <ul class="sessions-workspace-thread-list sessions-workspace-group-threads">
                        <For each={group.sessions}>
                          {(session) => (
                            <li class="sessions-workspace-thread">
                              <button
                                class="sessions-workspace-thread-link"
                                type="button"
                                aria-current={props.workspace.sessionList.isSelected(session.id) ? "page" : undefined}
                                onClick={() => {
                                  props.workspace.sessionList.selectSession(session.id)
                                  props.close?.()
                                }}
                                title={session.title}
                              >
                                <span class="sessions-workspace-thread-title">{session.title}</span>
                              </button>
                              <SessionSidebarMenu
                                ariaLabel={`Session actions for ${session.title}`}
                                onRename={() => props.workspace.sessionList.actions.sessionRenameOpen(session.id)}
                                onDelete={() => props.workspace.sessionList.actions.sessionDeleteOpen(session.id)}
                              />
                            </li>
                          )}
                        </For>
                      </ul>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          </Match>
        </Switch>
        <Show when={props.workspace.sessionList.sidebar.canLoadMore()}>
          <button
            class="sessions-workspace-load-more"
            type="button"
            disabled={props.workspace.sessionList.sidebar.isLoadingMore()}
            onClick={props.workspace.sessionList.sidebar.loadMore}
          >
            {props.workspace.sessionList.sidebar.isLoadingMore() ? "Loading..." : "Load more"}
          </button>
        </Show>
      </section>
      <NewProjectDialog
        activeProject={props.workspace.activeProject}
        buttonChildren={null}
        buttonClass="hidden"
        idPrefix={props.mobile ? "mobile-session-new-project" : "session-new-project"}
        onOpenChange={props.mobile ? undefined : props.workspace.projectCreateOpenChange}
        open={props.mobile ? undefined : props.workspace.projectCreateOpen}
        projectRegistry={props.workspace.projectRegistry}
      />
      <Show when={!props.mobile}>
        <SessionSidebarDialogs actions={props.workspace.sessionList.actions} />
      </Show>
    </nav>
  )
}

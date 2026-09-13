import { For, Show } from "solid-js"
import { ButtonIconOnly } from "#ui/interactive/button/ButtonIconOnly.jsx"
import { buttonVariant } from "#ui/interactive/button/buttonCva.js"
import { Icon } from "#ui/static/icon/Icon.jsx"
import { ProjectAvatar } from "../project/ui/ProjectAvatar.js"
import { applicationIcon } from "./applicationIcon.js"
import { SessionSidebarMenu } from "./SessionSidebarMenu.js"
import type { SessionListState } from "./sessionListStateCreate.js"
import type { SessionProjectTarget } from "./sessionProjectTarget.js"

type SessionRow = ReturnType<SessionListState["sidebar"]["tabs"]>["recent"][number]
type Project = ReturnType<SessionListState["sidebar"]["tabs"]>["projects"][number]

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
                    <ProjectAvatar name={row.projectLabel} faviconUrl={row.faviconUrl} class="size-3 text-[8px]" />
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
                      path={applicationIcon.loading}
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
                    icon={applicationIcon.delete}
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

export function ProjectRow(props: {
  project: Project
  selectSession: (sessionId: string) => void
  sessionNewInProject?: (target: SessionProjectTarget) => void
  sessionCreateInProject?: (target: SessionProjectTarget) => void
  state: SessionListState
}) {
  return (
    <details class="group" open={props.state.projectIsOpen(props.project)}>
      <summary class="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 text-xs font-semibold text-strong hover:bg-surface-hover">
        <button
          class="flex min-w-0 flex-1 items-center gap-2 border-0 bg-transparent p-0 text-left text-xs font-semibold"
          type="button"
          aria-disabled={props.project.available === false}
          title={props.project.projectPath || props.project.projectLabel}
          onClick={(event) => {
            if (props.sessionNewInProject === undefined || props.project.available === false) return
            event.preventDefault()
            event.stopPropagation()
            props.sessionNewInProject(
              props.project.projectId === undefined
                ? { kind: "path", projectPath: props.project.projectPath }
                : { kind: "registered", projectId: props.project.projectId },
            )
          }}
        >
          <ProjectAvatar name={props.project.projectLabel} faviconUrl={props.project.faviconUrl} />
          <span
            class="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
            classList={{ "text-faint": props.project.available === false }}
          >
            {props.project.projectLabel}
            {props.project.available === false ? " (unavailable)" : ""}
          </span>
        </button>
        <Show when={props.state.sidebar.showsManagementControls()}>
          <SessionSidebarMenu
            ariaLabel={`Project actions for ${props.project.projectLabel}`}
            deleteLabel={props.project.projectId !== undefined ? "Remove" : "Delete"}
            onRename={() => props.state.actions.projectRenameOpen(props.project)}
            onMove={
              props.project.projectId !== undefined
                ? () => props.state.actions.projectMoveOpen(props.project)
                : undefined
            }
            onDelete={() =>
              props.project.projectId !== undefined
                ? props.state.actions.projectRemoveOpen(props.project)
                : props.state.actions.projectDeleteOpen(props.project)
            }
          />
          <ButtonIconOnly
            class="size-6 shrink-0 rounded-md text-faint hover:bg-transparent hover:text-faint disabled:opacity-40"
            disabled={props.project.available === false}
            icon={applicationIcon.sessionCreate}
            iconClass="size-3.5 fill-current text-faint dark:fill-current"
            title={
              props.project.available === false
                ? `${props.project.projectLabel} is unavailable`
                : `New session in ${props.project.projectLabel}`
            }
            aria-label={
              props.project.available === false
                ? `${props.project.projectLabel} is unavailable`
                : `New session in ${props.project.projectLabel}`
            }
            variant={buttonVariant.ghost}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              if (props.project.available === false) return
              props.sessionCreateInProject?.(
                props.project.projectId === undefined
                  ? { kind: "path", projectPath: props.project.projectPath }
                  : { kind: "registered", projectId: props.project.projectId },
              )
            }}
          />
        </Show>
      </summary>
      <Show when={props.project.sessions.length > 0}>
        <div>
          <SessionRows
            hideProjectLabel
            rows={props.project.sessions}
            isSelected={props.state.isSelected}
            onSessionDelete={props.state.actions.sessionDeleteOpen}
            onSessionDeleteImmediate={(sessionId) => void props.state.actions.sessionDeleteImmediate(sessionId)}
            onSessionRename={props.state.actions.sessionRenameOpen}
            selectSession={props.selectSession}
          />
        </div>
      </Show>
    </details>
  )
}

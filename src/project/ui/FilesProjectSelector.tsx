import { Match, Show, Switch } from "solid-js"
import { Button } from "#ui/interactive/button/Button.jsx"
import { Icon } from "#ui/static/icon/Icon.jsx"
import { projectFolderIconSelect } from "./projectFolderIconSelect.js"
import { SearchablePicker } from "../../ui/SearchablePicker.js"
import { filesProjectPickerItemsDerive } from "./filesProjectPickerItemsDerive.js"
import type { FilesScreenView } from "./filesScreenView.js"

export function FilesProjectSelector(props: { compact?: boolean; state: FilesScreenView }) {
  const state = props.state

  return (
    <section
      class="border-[var(--border)] bg-[var(--surface)]"
      classList={{
        "mb-4 rounded-xl border p-3": !props.compact,
        "shrink-0 border-x-0 border-t-0 px-3 py-3": props.compact,
      }}
      aria-labelledby={props.compact ? "panel-project-selector-heading" : "project-selector-heading"}
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1
            id={props.compact ? "panel-project-selector-heading" : "project-selector-heading"}
            class="m-0 text-sm font-semibold text-[var(--foreground)]"
          >
            {props.compact ? "Workspace" : "Project files"}
          </h1>
          <Show when={!props.compact}>
            <p class="m-0 mt-1 text-[11px] text-[var(--muted-foreground)]">Choose a registered project to browse.</p>
          </Show>
          <Show when={state.truncated()}>
            <p class="m-0 mt-2 text-xs text-danger" role="status">
              Project discovery is limited. Some projects may not be shown.
            </p>
          </Show>
        </div>
        <Switch>
          <Match when={state.status() === "loading"}>
            <p class="m-0 text-xs text-[var(--muted-foreground)]" role="status">
              Loading projects...
            </p>
          </Match>
          <Match when={state.status() === "error"}>
            <div class="flex items-center gap-3 text-xs text-danger" role="alert">
              <span>Couldn't load projects.</span>
              <Button variant="none" size="none" class="text-[var(--accent)]" onClick={state.retry}>
                Retry
              </Button>
            </div>
          </Match>
          <Match when={state.projects().length === 0}>
            <p class="m-0 text-xs text-[var(--muted-foreground)]" role="status">
              No registered projects available.
            </p>
          </Match>
          <Match when={true}>
            <div class="min-w-0 flex-1 basis-full">
              <SearchablePicker
                ariaLabel="Project files"
                emptyText="No projects match your search."
                idPrefix={props.compact ? "panel-project-selector" : "project-selector"}
                items={filesProjectPickerItemsDerive(state.projects())}
                onSelect={(project) => state.projectSelect(project.id)}
                placeholder="Search projects…"
                selectedId={state.selectedProject()?.id ?? null}
                renderLeading={() => <Icon class="size-5 shrink-0 text-faint" path={projectFolderIconSelect(false)} />}
              />
            </div>
          </Match>
        </Switch>
      </div>
    </section>
  )
}

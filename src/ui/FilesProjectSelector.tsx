import { Match, Show, Switch } from "solid-js"
import type { FilesScreenView } from "./filesScreenView.js"

export function FilesProjectSelector(props: { compact?: boolean; state: FilesScreenView }) {
  const state = props.state

  return (
    <section
      class="border-[var(--border)] bg-[var(--surface)]"
      classList={{
        "mb-4 rounded-xl border p-3": !props.compact,
        "shrink-0 border-x-0 border-t-0 px-3 py-2": props.compact,
      }}
      aria-labelledby={props.compact ? "panel-project-selector-heading" : "project-selector-heading"}
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1
            id={props.compact ? "panel-project-selector-heading" : "project-selector-heading"}
            class="m-0 text-sm font-semibold text-[var(--foreground)]"
          >
            Project files
          </h1>
          <Show when={!props.compact}>
            <p class="m-0 mt-1 text-[11px] text-[var(--muted-foreground)]">Choose a discovered project to browse.</p>
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
              <button class="text-[var(--accent)]" type="button" onClick={state.retry}>
                Retry
              </button>
            </div>
          </Match>
          <Match when={state.projects().length === 0}>
            <p class="m-0 text-xs text-[var(--muted-foreground)]" role="status">
              No projects were discovered.
            </p>
          </Match>
          <Match when={true}>
            <label class="flex min-w-0 items-center gap-2 text-xs text-[var(--muted-foreground)]">
              <span>Project</span>
              <select
                class="min-w-0 max-w-64 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--foreground)]"
                value={state.selectedProject()?.id}
                onChange={state.projectSelect}
              >
                {state.projects().map((project) => (
                  <option value={project.id}>{project.label}</option>
                ))}
              </select>
            </label>
          </Match>
        </Switch>
      </div>
    </section>
  )
}

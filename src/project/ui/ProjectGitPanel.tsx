import { For, Match, Show, Switch } from "solid-js"
import type { ProjectGitPanelView } from "./projectGitPanelView.js"

export function ProjectGitPanel(props: { state: ProjectGitPanelView }) {
  const state = props.state

  return (
    <section class="min-w-0 rounded-xl border border-line bg-surface p-3" aria-labelledby="project-git-heading">
      <header class="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <div>
          <h2 id="project-git-heading" class="m-0 text-sm font-semibold text-strong">
            Project Git
          </h2>
          <p class="m-0 mt-1 text-[11px] text-faint">Local branches in this project repository only.</p>
        </div>
        <Show when={state.status()?.branch} fallback={<span class="text-xs text-faint">Detached HEAD</span>}>
          {(branch) => <code class="rounded bg-surface-raised px-2 py-1 text-xs text-accent">{branch()}</code>}
        </Show>
      </header>

      <Switch>
        <Match when={state.loadStatus() === "loading"}>
          <p class="text-xs text-faint" role="status">
            Loading Git status...
          </p>
        </Match>
        <Match when={state.loadStatus() === "error"}>
          <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-danger" role="alert">
            <span>Project Git is unavailable.</span>
            <button class="text-accent" type="button" onClick={state.retry}>
              Retry
            </button>
          </div>
        </Match>
        <Match when={state.status()?.isGitRepository === false}>
          <p class="text-xs text-faint">This project root is not a Git repository.</p>
        </Match>
        <Match when={true}>
          <div class="grid min-w-0 gap-4 xl:grid-cols-2">
            <div class="min-w-0">
              <h3 class="m-0 text-xs font-semibold uppercase tracking-wide text-faint">Working tree</h3>
              <Show when={state.diffSummary()}>
                {(summary) => (
                  <p class="my-2 text-xs text-subtle">
                    {summary().filesChanged} changed, <span class="text-success">+{summary().additions}</span>,{" "}
                    <span class="text-danger">-{summary().deletions}</span>
                    <Show when={summary().binaryFiles > 0}> · {summary().binaryFiles} binary</Show>
                  </p>
                )}
              </Show>
              <Show
                when={state.status()?.files.length}
                fallback={<p class="text-xs text-success">Clean working tree.</p>}
              >
                <ul
                  class="m-0 max-h-44 list-none space-y-1 overflow-auto p-0 text-xs"
                  aria-label="Changed project files"
                  tabindex="0"
                >
                  <For each={state.status()?.files}>
                    {(file) => (
                      <li class="flex min-w-0 items-center gap-2">
                        <span class="w-16 shrink-0 text-[10px] uppercase text-danger">{file.status}</span>
                        <code class="min-w-0 truncate text-subtle" title={file.path}>
                          {file.path}
                        </code>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </div>

            <div class="min-w-0">
              <h3 class="m-0 text-xs font-semibold uppercase tracking-wide text-faint">Local branches</h3>
              <p class="my-2 text-[11px] text-faint" id="branch-switch-constraint">
                Switching is available only when the working tree is clean. Rename and delete do not discard file
                changes.
              </p>
              <ul class="m-0 max-h-52 list-none space-y-2 overflow-auto p-0" aria-label="Local Git branches">
                <For each={state.localBranches()}>
                  {(branch) => (
                    <li class="rounded-lg border border-line bg-surface-sunken p-2">
                      <Show
                        when={state.renamingBranch() === branch.name}
                        fallback={
                          <div class="flex min-w-0 flex-wrap items-center gap-2">
                            <code class="mr-auto min-w-0 truncate text-xs text-subtle" title={branch.name}>
                              {branch.name}
                            </code>
                            <Show when={branch.isCurrent}>
                              <span class="text-[10px] uppercase text-success">Current</span>
                            </Show>
                            <button
                              class="rounded border border-line px-2 py-1 text-[11px] text-accent disabled:cursor-not-allowed disabled:opacity-40"
                              type="button"
                              disabled={
                                branch.isCurrent ||
                                state.status()?.isDirty !== false ||
                                state.actionStatus() === "loading"
                              }
                              aria-describedby="branch-switch-constraint"
                              onClick={() => state.branchSwitch(branch.name)}
                            >
                              Switch
                            </button>
                            <button
                              class="px-1 text-[11px] text-subtle hover:text-accent"
                              type="button"
                              onClick={() => state.renameOpen(branch.name)}
                            >
                              Rename
                            </button>
                            <button
                              class="px-1 text-[11px] text-danger disabled:opacity-40"
                              type="button"
                              disabled={branch.isCurrent}
                              onClick={() => state.branchDelete(branch.name)}
                            >
                              Delete
                            </button>
                          </div>
                        }
                      >
                        <form class="flex flex-wrap gap-2" onSubmit={(event) => state.branchRename(event, branch.name)}>
                          <label class="sr-only" for={`rename-${branch.name}`}>
                            New name for {branch.name}
                          </label>
                          <input
                            id={`rename-${branch.name}`}
                            class="min-w-0 flex-1 rounded border border-line-strong bg-surface px-2 py-1 text-xs text-strong"
                            name="newBranch"
                            value={branch.name}
                            required
                            autofocus
                          />
                          <button class="text-[11px] text-accent" type="submit">
                            Save
                          </button>
                          <button class="text-[11px] text-faint" type="button" onClick={state.renameCancel}>
                            Cancel
                          </button>
                        </form>
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
              <Show when={state.localBranches().length === 0}>
                <p class="text-xs text-faint">No local branches.</p>
              </Show>
            </div>
          </div>
          <Show when={state.message()}>
            <p
              class="mt-3 mb-0 text-xs"
              classList={{
                "text-danger": state.actionStatus() === "error",
                "text-success": state.actionStatus() === "success",
              }}
              role={state.actionStatus() === "error" ? "alert" : "status"}
            >
              {state.message()}
            </p>
          </Show>
        </Match>
      </Switch>
    </section>
  )
}

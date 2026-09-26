import { For, Show } from "solid-js"
import { Button } from "#ui/interactive/button/Button.jsx"
import { buttonSize, buttonVariant } from "#ui/interactive/button/buttonCva.js"
import { globalSubagentsViewerStateCreate } from "./globalSubagentsViewerStateCreate.js"

export function GlobalSubagentsViewer() {
  const state = globalSubagentsViewerStateCreate()
  return (
    <section class="grid gap-5" aria-labelledby="global-subagents-title">
      <header>
        <p class="m-0 text-xs text-accent uppercase">Global configuration</p>
        <h1 id="global-subagents-title" class="m-0 text-2xl font-semibold">
          Subagents
        </h1>
        <p class="text-faint text-sm">
          Executable agents from the global agent catalog. Project-local agents load automatically in their project.
          Catalog files are read-only here.
        </p>
      </header>
      <Show when={state.loading()}>
        <p role="status">Loading global agents…</p>
      </Show>
      <Show when={state.error()}>
        <p role="alert" class="text-danger">
          {state.error()}{" "}
          <Button size={buttonSize.sm} variant={buttonVariant.outline} onClick={() => void state.load()}>
            Retry
          </Button>
        </p>
      </Show>
      <Show when={!state.loading() && !state.error()}>
        <ul class="m-0 grid list-none gap-2 p-0">
          <For each={state.agents()} fallback={<li>No global agents found.</li>}>
            {(agent) => (
              <li class="rounded border border-line p-3">
                <strong class="font-mono">{agent.id}</strong>{" "}
                <span class="text-faint text-sm">
                  {agent.mode === "primary" ? "Primary only" : "Subagent"}
                  {agent.enabled ? "" : " · Disabled"}
                </span>
                <Show when={agent.description}>
                  <p class="m-0 mt-1 text-sm">{agent.description}</p>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </section>
  )
}

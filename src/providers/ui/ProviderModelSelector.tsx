import { For, Match, Switch } from "solid-js"
import { providerModelSelectorStateCreate } from "./providerModelSelectorStateCreate.js"

const selectClass =
  "h-8 max-w-[220px] min-w-0 cursor-pointer appearance-none truncate rounded-[9px] border-none bg-transparent px-2 text-xs text-faint hover:bg-surface-hover hover:text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed"

export function ProviderModelSelector(props: { state: ReturnType<typeof providerModelSelectorStateCreate> }) {
  const state = props.state

  return (
    <div class="flex min-w-0 items-center gap-1">
      <Switch>
        <Match when={state.status() === "idle"}>
          <select class={selectClass} aria-label="Provider model" disabled>
            <option>Select a conversation</option>
          </select>
        </Match>
        <Match when={state.status() === "loading"}>
          <select class={selectClass} aria-label="Provider model" disabled>
            <option>Loading models...</option>
          </select>
        </Match>
        <Match when={state.status() === "error"}>
          <select class={`${selectClass} text-danger`} aria-label="Provider model" disabled>
            <option>Models unavailable</option>
          </select>
        </Match>
        <Match when={state.status() === "ready"}>
          <select
            class={selectClass}
            aria-label="Provider model"
            aria-describedby="provider-model-application"
            value={state.selectedModel() ?? ""}
            onChange={(event) => state.modelSelect(event.currentTarget.value)}
          >
            <For each={state.models()}>{(model) => <option value={model.id}>{model.name ?? model.id}</option>}</For>
          </select>
        </Match>
      </Switch>
      <p class="sr-only m-0" id="provider-model-application">
        <Switch>
          <Match when={state.status() === "ready"}>New messages use {state.selectedModel()}.</Match>
          <Match when={state.status() === "error"}>Provider discovery is unavailable.</Match>
          <Match when={true}>Selection applies after choosing a conversation.</Match>
        </Switch>
      </p>
    </div>
  )
}

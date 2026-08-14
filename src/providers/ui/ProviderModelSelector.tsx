import { For, Match, Switch } from "solid-js"
import { providerModelSelectorStateCreate } from "./providerModelSelectorStateCreate.js"

export function ProviderModelSelector(props: { state: ReturnType<typeof providerModelSelectorStateCreate> }) {
  const state = props.state

  return (
    <div class="grid min-w-48 gap-1 max-[760px]:min-w-52">
      <label class="grid gap-1 text-[11px] font-semibold tracking-[0.06em] text-faint uppercase">
        <span>Provider model</span>
        <Switch>
          <Match when={state.status() === "idle"}>
            <select
              class="rounded-[7px] border border-line bg-surface-raised px-2.5 py-2 text-xs font-normal tracking-normal text-faint normal-case"
              disabled
            >
              <option>Select a conversation</option>
            </select>
          </Match>
          <Match when={state.status() === "loading"}>
            <select
              class="rounded-[7px] border border-line bg-surface-raised px-2.5 py-2 text-xs font-normal tracking-normal text-faint normal-case"
              disabled
            >
              <option>Loading models...</option>
            </select>
          </Match>
          <Match when={state.status() === "error"}>
            <select
              class="rounded-[7px] border border-danger-border bg-surface-raised px-2.5 py-2 text-xs font-normal tracking-normal text-danger normal-case"
              disabled
            >
              <option>Models unavailable</option>
            </select>
          </Match>
          <Match when={state.status() === "ready"}>
            <select
              class="rounded-[7px] border border-accent-border bg-surface-raised px-2.5 py-2 text-xs font-normal tracking-normal text-accent normal-case"
              aria-describedby="provider-model-application"
              value={state.selectedModel() ?? ""}
              onChange={(event) => state.modelSelect(event.currentTarget.value)}
            >
              <For each={state.models()}>{(model) => <option value={model.id}>{model.name ?? model.id}</option>}</For>
            </select>
          </Match>
        </Switch>
      </label>
      <p class="m-0 max-w-64 text-[9px] leading-[1.35] text-faint" id="provider-model-application">
        <Switch>
          <Match when={state.status() === "ready"}>New messages use {state.selectedModel()}.</Match>
          <Match when={state.status() === "error"}>Provider discovery is unavailable.</Match>
          <Match when={true}>Selection applies after choosing a conversation.</Match>
        </Switch>
      </p>
    </div>
  )
}

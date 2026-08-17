import { For, Match, Show, Switch } from "solid-js"
import type { ProviderModelSelectorState } from "./providerModelSelectorStateCreate.js"

const selectClass =
  "h-8 max-w-[220px] min-w-0 cursor-pointer appearance-none truncate rounded-[9px] border-none bg-transparent px-2 text-xs text-faint hover:bg-surface-hover hover:text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed"
export function ProviderModelSelector(props: { state: ProviderModelSelectorState }) {
  return (
    <div class="flex min-w-0 items-center gap-1">
      <Switch>
        <Match when={props.state.status() === "idle"}>
          <select class={selectClass} aria-label="Provider model" disabled>
            <option>Loading models...</option>
          </select>
        </Match>
        <Match when={props.state.status() === "loading"}>
          <select class={selectClass} aria-label="Provider model" disabled>
            <option>Loading models...</option>
          </select>
        </Match>
        <Match when={props.state.status() === "error"}>
          <select class={`${selectClass} text-danger`} aria-label="Provider model" disabled>
            <option>Models unavailable</option>
          </select>
        </Match>
        <Match when={props.state.status() === "ready"}>
          <select
            class={selectClass}
            aria-label="Provider model"
            aria-describedby="provider-model-application"
            value={props.state.selectedModelValue()}
            onChange={(event) => props.state.modelValueSelect(event.currentTarget.value)}
          >
            <For each={props.state.groups()}>
              {(provider) => (
                <optgroup label={provider.name}>
                  <For each={provider.models}>{(model) => <option value={model.value}>{model.name}</option>}</For>
                </optgroup>
              )}
            </For>
          </select>
        </Match>
      </Switch>
      <select
        class={selectClass}
        aria-label="Reasoning effort"
        disabled={props.state.status() !== "ready" || props.state.effortOptions().length === 0}
        value={props.state.selectedReasoningEffort() ?? ""}
        onChange={(event) => props.state.reasoningEffortValueSelect(event.currentTarget.value)}
      >
        <For each={props.state.effortOptions()}>{(effort) => <option value={effort}>{effort} effort</option>}</For>
        <Show when={props.state.effortOptions().length === 0}>
          <option value="">Default effort</option>
        </Show>
      </select>
      <p class="sr-only m-0" id="provider-model-application">
        <Switch>
          <Match when={props.state.status() === "ready"}>
            New messages use {props.state.selectedModel()} from {props.state.selectedProvider()}.
          </Match>
          <Match when={props.state.status() === "error"}>Provider discovery is unavailable.</Match>
          <Match when={true}>Loading available models.</Match>
        </Switch>
      </p>
    </div>
  )
}

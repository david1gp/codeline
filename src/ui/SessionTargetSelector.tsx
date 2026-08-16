import { For, Match, Show, Switch } from "solid-js"
import { Button } from "#ui/interactive/button/Button.jsx"
import type { SessionTargetSelectorState } from "./sessionTargetSelectorStateCreate.js"

const selectClass =
  "h-8 max-w-[220px] min-w-0 cursor-pointer appearance-none truncate rounded-[9px] border-none bg-transparent px-2 text-xs text-faint hover:bg-surface-hover hover:text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed"
const retryClass = "min-h-11 rounded-lg border border-danger-border px-2 text-[10px] font-semibold text-danger"
const groupClass = "flex items-center gap-[9px]"

export function SessionTargetSelector(props: { state: SessionTargetSelectorState }) {
  const state = props.state

  return (
    <div class={groupClass}>
      <Switch>
        <Match when={state.agentStatus() === "loading"}>
          <select class={selectClass} aria-label="Agent for a new session" disabled>
            <option>Loading agents...</option>
          </select>
        </Match>
        <Match when={state.agentStatus() === "empty"}>
          <select class={selectClass} aria-label="Agent for a new session" disabled>
            <option>No primary agent configured</option>
          </select>
        </Match>
        <Match when={state.agentStatus() === "error"}>
          <select class={`${selectClass} text-danger`} aria-label="Agent for a new session" disabled>
            <option>Agents unavailable</option>
          </select>
        </Match>
        <Match when={state.agentStatus() === "ready"}>
          <select
            class={selectClass}
            aria-label="Agent for a new session"
            value={state.selectedAgentId() ?? ""}
            onChange={(event) => state.agentSelect(event.currentTarget.value)}
          >
            <For each={state.agents()}>{(agent) => <option value={agent.id}>{agent.name}</option>}</For>
          </select>
        </Match>
      </Switch>
      <Show when={state.agentStatus() === "error"}>
        <Button
          variant="none"
          size="none"
          class={retryClass}
          aria-label="Retry loading agents"
          onClick={state.agentsReload}
        >
          Retry
        </Button>
      </Show>
    </div>
  )
}

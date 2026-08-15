import { For, Match, Show, Switch } from "solid-js"
import type { SessionTargetSelectorState } from "./sessionTargetSelectorStateCreate.js"

const selectClass =
  "min-h-11 min-w-40 appearance-none rounded-[7px] border border-line bg-surface-raised px-2.5 py-2 text-xs font-normal tracking-normal text-accent normal-case max-[760px]:col-span-full max-[760px]:row-start-2 max-[760px]:min-w-44"
const disabledSelectClass =
  "min-h-11 min-w-40 appearance-none rounded-[7px] border border-line bg-surface-raised px-2.5 py-2 text-xs font-normal tracking-normal text-faint normal-case max-[760px]:col-span-full max-[760px]:row-start-2 max-[760px]:min-w-44"
const retryClass = "min-h-11 rounded-lg border border-danger-border px-2 text-[10px] font-semibold text-danger"
const labelClass =
  "relative grid grid-cols-[auto_minmax(130px,auto)] items-center gap-[9px] text-[11px] font-semibold tracking-[0.06em] text-faint uppercase max-[760px]:min-w-max max-[760px]:grid-cols-[auto_auto] max-[760px]:grid-rows-[auto_auto]"
const groupClass = "flex items-center gap-[9px]"

export function SessionTargetSelector(props: { state: SessionTargetSelectorState }) {
  const state = props.state

  return (
    <div class={groupClass}>
      <label class={labelClass}>
        <span>Agent</span>
        <Switch>
          <Match when={state.agentStatus() === "loading"}>
            <select class={disabledSelectClass} aria-label="Agent for a new session" disabled>
              <option>Loading agents...</option>
            </select>
          </Match>
          <Match when={state.agentStatus() === "empty"}>
            <select class={disabledSelectClass} aria-label="Agent for a new session" disabled>
              <option>No agent configured</option>
            </select>
          </Match>
          <Match when={state.agentStatus() === "error"}>
            <select class={disabledSelectClass} aria-label="Agent for a new session" disabled>
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
      </label>
      <Show when={state.agentStatus() === "error"}>
        <button class={retryClass} type="button" aria-label="Retry loading agents" onClick={state.agentsReload}>
          Retry
        </button>
      </Show>
    </div>
  )
}

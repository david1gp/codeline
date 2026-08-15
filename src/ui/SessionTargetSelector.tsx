import { Match, Show, Switch } from "solid-js"
import { Button } from "#ui/interactive/button/Button.jsx"
import type { SessionTargetSelectorState } from "./sessionTargetSelectorStateCreate.js"

const disabledSelectClass =
  "min-h-11 min-w-40 appearance-none !rounded-[7px] !border !border-line !bg-surface-raised !px-2.5 !py-2 text-xs font-normal tracking-normal !text-faint normal-case max-[760px]:col-span-full max-[760px]:row-start-2 max-[760px]:min-w-44"
const retryClass = "min-h-11 rounded-lg border border-danger-border px-2 text-[10px] font-semibold text-danger"
const labelClass =
  "relative grid grid-cols-[auto_minmax(130px,auto)] items-center gap-[9px] text-[11px] font-semibold tracking-[0.06em] text-faint uppercase max-[760px]:min-w-max max-[760px]:grid-cols-[auto_auto] max-[760px]:grid-rows-[auto_auto]"
const groupClass = "flex items-center gap-[9px]"

export function SessionTargetSelector(props: { state: SessionTargetSelectorState }) {
  const state = props.state

  return (
    <div class={groupClass}>
      <fieldset class={`${labelClass} m-0 border-0 p-0`} aria-label="Agent for a new session">
        <span>Agent</span>
        <Switch>
          <Match when={state.agentStatus() === "loading"}>
            <span class={disabledSelectClass}>Loading agent...</span>
          </Match>
          <Match when={state.agentStatus() === "empty"}>
            <span class={disabledSelectClass}>No agent configured</span>
          </Match>
          <Match when={state.agentStatus() === "error"}>
            <span class={disabledSelectClass}>Agents unavailable</span>
          </Match>
          <Match when={state.agentStatus() === "ready"}>
            <span class={disabledSelectClass}>{state.selectedAgentName()}</span>
          </Match>
        </Switch>
      </fieldset>
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

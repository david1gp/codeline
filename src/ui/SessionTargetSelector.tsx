import { Match, Show, Switch } from "solid-js"
import { SelectSingleNative } from "#ui/input/select/SelectSingleNative.jsx"
import { Button } from "#ui/interactive/button/Button.jsx"
import type { SessionTargetSelectorState } from "./sessionTargetSelectorStateCreate.js"

const selectClass =
  "min-h-11 min-w-40 appearance-none !rounded-[7px] !border !border-line !bg-surface-raised !px-2.5 !py-2 text-xs font-normal tracking-normal !text-strong normal-case focus:!border-accent-border focus:!ring-accent-border max-[760px]:col-span-full max-[760px]:row-start-2 max-[760px]:min-w-44"
const disabledSelectClass =
  "min-h-11 min-w-40 appearance-none !rounded-[7px] !border !border-line !bg-surface-raised !px-2.5 !py-2 text-xs font-normal tracking-normal !text-faint normal-case max-[760px]:col-span-full max-[760px]:row-start-2 max-[760px]:min-w-44"
const retryClass = "min-h-11 rounded-lg border border-danger-border px-2 text-[10px] font-semibold text-danger"
const labelClass =
  "relative grid grid-cols-[auto_minmax(130px,auto)] items-center gap-[9px] text-[11px] font-semibold tracking-[0.06em] text-faint uppercase max-[760px]:min-w-max max-[760px]:grid-cols-[auto_auto] max-[760px]:grid-rows-[auto_auto]"
const groupClass = "flex items-center gap-[9px]"

export function SessionTargetSelector(props: { state: SessionTargetSelectorState }) {
  const state = props.state
  const agentOptions = () => {
    const status = state.agentStatus()
    if (status === "loading") return ["Loading agents..."]
    if (status === "empty") return ["No agent configured"]
    if (status === "error") return ["Agents unavailable"]
    return state.agents().map((agent) => agent.id)
  }
  const agentValueSignal = {
    get: () => {
      const options = agentOptions()
      const selectedAgentId = state.selectedAgentId()
      if (selectedAgentId !== null && options.includes(selectedAgentId)) return selectedAgentId
      return options[0] ?? ""
    },
    set: state.agentSelect,
  }

  return (
    <div class={groupClass}>
      <label class={labelClass} for="session-target-agent" aria-label="Agent for a new session">
        <span>Agent</span>
        <Switch>
          <Match when={state.agentStatus() === "loading"}>
            <SelectSingleNative
              id="session-target-agent"
              class={disabledSelectClass}
              valueSignal={agentValueSignal}
              getOptions={agentOptions}
              disabled
            />
          </Match>
          <Match when={state.agentStatus() === "empty"}>
            <SelectSingleNative
              id="session-target-agent"
              class={disabledSelectClass}
              valueSignal={agentValueSignal}
              getOptions={agentOptions}
              disabled
            />
          </Match>
          <Match when={state.agentStatus() === "error"}>
            <SelectSingleNative
              id="session-target-agent"
              class={disabledSelectClass}
              valueSignal={agentValueSignal}
              getOptions={agentOptions}
              disabled
            />
          </Match>
          <Match when={state.agentStatus() === "ready"}>
            <SelectSingleNative
              id="session-target-agent"
              class={selectClass}
              valueSignal={agentValueSignal}
              getOptions={agentOptions}
              valueText={(agentId) => state.agents().find((agent) => agent.id === agentId)?.name ?? agentId}
            />
          </Match>
        </Switch>
      </label>
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

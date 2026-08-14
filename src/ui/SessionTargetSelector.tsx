import { For, Match, Show, Switch } from "solid-js"
import type { SessionTargetSelectorState } from "./sessionTargetSelectorStateCreate.js"

const selectClass =
  "min-h-11 min-w-40 appearance-none rounded-[7px] border border-[#30342a] bg-[#1c1f19] px-2.5 py-2 text-xs font-normal tracking-normal text-[#d8ff72] normal-case max-[760px]:col-span-full max-[760px]:row-start-2 max-[760px]:min-w-44"
const disabledSelectClass =
  "min-h-11 min-w-40 appearance-none rounded-[7px] border border-[#30342a] bg-[#1c1f19] px-2.5 py-2 text-xs font-normal tracking-normal text-[#8d9285] normal-case max-[760px]:col-span-full max-[760px]:row-start-2 max-[760px]:min-w-44"
const retryClass = "min-h-11 rounded-lg border border-[#5d4237] px-2 text-[10px] font-semibold text-[#d6a28b]"
const labelClass =
  "relative grid grid-cols-[auto_minmax(130px,auto)] items-center gap-[9px] text-[11px] font-semibold tracking-[0.06em] text-[#969b8d] uppercase max-[760px]:min-w-max max-[760px]:grid-cols-[auto_auto] max-[760px]:grid-rows-[auto_auto]"
const groupClass = "flex items-center gap-[9px]"

export function SessionTargetSelector(props: { state: SessionTargetSelectorState }) {
  const state = props.state

  return (
    <>
      <div class={groupClass}>
        <label class={labelClass}>
          <span>Server</span>
          <Switch>
            <Match when={state.serverStatus() === "loading"}>
              <select class={disabledSelectClass} aria-label="Server for a new session" disabled>
                <option>Loading servers...</option>
              </select>
            </Match>
            <Match when={state.serverStatus() === "empty"}>
              <select class={disabledSelectClass} aria-label="Server for a new session" disabled>
                <option>No server available</option>
              </select>
            </Match>
            <Match when={state.serverStatus() === "error"}>
              <select class={disabledSelectClass} aria-label="Server for a new session" disabled>
                <option>Servers unavailable</option>
              </select>
            </Match>
            <Match when={state.serverStatus() === "ready"}>
              <select
                class={selectClass}
                aria-label="Server for a new session"
                value={state.selectedServerId() ?? ""}
                onChange={(event) => state.serverSelect(event.currentTarget.value)}
              >
                <For each={state.servers()}>{(server) => <option value={server.id}>{server.name}</option>}</For>
              </select>
            </Match>
          </Switch>
        </label>
        <Show when={state.serverStatus() === "error"}>
          <button class={retryClass} type="button" aria-label="Retry loading servers" onClick={state.serversReload}>
            Retry
          </button>
        </Show>
      </div>

      <span class="h-7 w-px bg-[#30342a] max-[760px]:h-auto" aria-hidden="true" />

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

      <span class="h-7 w-px bg-[#30342a] max-[760px]:h-auto" aria-hidden="true" />

      <div class="grid gap-1">
        <button
          class="min-h-11 shrink-0 rounded-lg border border-[#46532c] bg-[#2b341c] px-4 text-sm font-semibold text-[#d8ff72] disabled:opacity-50"
          type="button"
          aria-label="Start a new session with the selected server and agent"
          disabled={!state.canCreateSession()}
          onClick={() => void state.sessionCreateStart()}
        >
          <Show when={state.isCreatingSession()} fallback="New session">
            Creating...
          </Show>
        </button>
        <p class="m-0 max-w-64 text-[9px] leading-[1.35] text-[#9da8b8]" role="status">
          <Switch fallback="Selection applies to a new session.">
            <Match when={state.sessionCreateStatus() === "error"}>The new session could not be created.</Match>
          </Switch>
        </p>
      </div>
    </>
  )
}

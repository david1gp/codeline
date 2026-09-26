import { Show } from "solid-js"
import { Button } from "#ui/interactive/button/Button.jsx"
import { Input } from "#ui/input/input/Input.jsx"
import { SelectSingleNative } from "#ui/input/select/SelectSingleNative.jsx"
import type { applicationShellStateCreate } from "../../ui/applicationShellStateCreate.js"
import { SessionCreationContextPopover } from "./SessionCreationContextPopover.js"
import type { SessionResourceSelectorView } from "./sessionResourceSelectorView.js"
import type { SessionTargetSelectorState } from "./sessionTargetSelectorStateCreate.js"
import { sessionCreationResourceSidebarStateCreate } from "./sessionCreationResourceSidebarStateCreate.js"

export function SessionCreationResourceSidebar(props: {
  idPrefix?: string
  shell?: ReturnType<typeof applicationShellStateCreate>
  state: SessionResourceSelectorView
  target: SessionTargetSelectorState
}) {
  const state = sessionCreationResourceSidebarStateCreate(() => props)

  return (
    <>
      <Show when={props.shell}>
        {(shell) => (
          <hr
            class="application-shell-resize-handle session-context-resize-handle"
            classList={{ "is-resizing": shell().isResizing("session-context") }}
            tabIndex={0}
            aria-label="Resize session context"
            aria-orientation="vertical"
            aria-valuemin="240"
            aria-valuemax="520"
            aria-valuenow={state.width()}
            onKeyDown={(event) => shell().resizeKeyDown("session-context", event)}
            onPointerCancel={shell().resizeCancel}
            onPointerDown={(event) => shell().resizeStart("session-context", event)}
            onLostPointerCapture={shell().resizeEnd}
            onPointerMove={shell().resizeMove}
            onPointerUp={shell().resizeEnd}
          />
        )}
      </Show>
      <aside
        class="session-context-panel flex shrink-0 flex-col gap-4 overflow-y-auto border-line-subtle border-l px-4 py-4 max-[1101px]:w-full max-[1101px]:border-l-0 max-[1101px]:border-t"
        style={{ "--session-context-width": `${state.width()}px` }}
        aria-labelledby={`${state.prefix()}-heading`}
      >
        <h3 id={`${state.prefix()}-heading`} class="m-0 text-sm font-semibold">New session</h3>
        <label class="grid gap-1.5 text-xs font-semibold text-faint" for={`${state.prefix()}-preset`}>
          Agent preset
          <SelectSingleNative
            id={`${state.prefix()}-preset`}
            class="rounded-md border border-line bg-surface px-2 py-1.5 text-xs text-foreground"
            valueSignal={state.preset}
            getOptions={state.presetOptions}
            valueText={state.presetOptionText}
          />
        </label>
        <Show when={props.target.presetStatus() === "loading"}>
          <p class="m-0 text-xs text-faint" role="status">Loading agent presets…</p>
        </Show>
        <Show when={props.target.presetStatus() === "error"}>
          <div role="alert">
            <p class="text-xs text-danger">{props.target.presetErrorMessage() ?? "Agent presets could not be loaded."}</p>
            <Button variant="outlineRed" size="sm" onClick={props.target.presetRetry}>Retry</Button>
          </div>
        </Show>
        <p class="m-0 text-xs text-faint">Execution agent: {props.target.selectedAgentName()}</p>
        <Show when={props.target.presetAgentUnavailable()}>
          <p class="m-0 text-xs text-danger" role="alert">The preset execution agent is unavailable. Choose another preset, or select a server and agent below to start without this preset.</p>
          <Button variant="outline" size="sm" onClick={() => props.target.presetSelect("")}>Use current agent without preset</Button>
        </Show>
        <label class="grid gap-1.5 text-xs font-semibold text-faint" for={`${state.prefix()}-server`}>
          Alternative server (clears preset)
          <SelectSingleNative id={`${state.prefix()}-server`} valueSignal={state.server} getOptions={state.serverOptions} valueText={state.serverOptionText} />
        </label>
        <label class="grid gap-1.5 text-xs font-semibold text-faint" for={`${state.prefix()}-agent`}>
          Alternative agent (clears preset)
          <SelectSingleNative id={`${state.prefix()}-agent`} valueSignal={state.agent} getOptions={state.agentOptions} valueText={state.agentOptionText} />
        </label>
        <Show when={props.target.projectAgentsErrorMessage()}>
          {(message) => <div role="alert"><p class="text-xs text-danger">{message()}</p><Button variant="outlineRed" size="sm" onClick={props.target.projectAgentsRetry}>Retry project agents</Button></div>}
        </Show>
        <label class="grid gap-1.5 text-xs font-semibold text-faint" for={`${state.prefix()}-model`}>
          Model
          <Input
            id={`${state.prefix()}-model`}
            value={props.target.selectedModelId()}
            onInput={(event) => props.target.modelChange(event.currentTarget.value)}
          />
        </label>
        <Show when={props.target.selectedPresetId() !== null && props.target.selectedModelId().trim() === ""}>
          <p class="m-0 text-xs text-danger" role="alert">Enter an available model before starting this preset.</p>
        </Show>
        <div class="grid gap-1.5">
          <p class="m-0 text-xs font-semibold text-faint">Prompt and context</p>
          <SessionCreationContextPopover idPrefix={`${state.prefix()}-context`} state={props.state} />
        </div>
        <p class="m-0 text-[11px] text-faint">Changes apply to the new session only.</p>
      </aside>
    </>
  )
}

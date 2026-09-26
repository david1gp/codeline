import { For, Show } from "solid-js"
import { Checkbox } from "#ui/input/check/Checkbox.jsx"
import { toolNameSchema } from "../../tools/schema/toolNameSchema.js"
import { globalAgentPresetEditorStateCreate } from "./globalAgentPresetEditorStateCreate.js"

export function SettingsToolsPanel() {
  const state = globalAgentPresetEditorStateCreate("tools")
  return (
    <section class="grid gap-5" aria-labelledby="settings-tools-title">
      <header>
        <p class="m-0 font-mono text-[10px] tracking-[0.1em] text-accent uppercase">Configuration</p>
        <h1 id="settings-tools-title" class="mt-1 mb-0 text-2xl font-semibold">
          Tools
        </h1>
        <p class="mt-1 mb-0 text-faint text-sm">Enable built-in tools in the default tool set. Tool authoring is not available.</p>
      </header>
      <Show when={state.loading()}><p role="status">Loading tools…</p></Show>
      <ul class="m-0 grid list-none gap-2 p-0">
        <For each={toolNameSchema.options}>
          {(name) => (
            <li class="rounded-lg border border-line bg-surface-raised px-4 py-3 font-mono text-sm">
              <Checkbox checked={state.selectedNames().includes(name)} disabled={!state.document() || state.busy()} onChange={(enabled) => void state.membershipChange(name, enabled)}>{name}</Checkbox>
            </li>
          )}
        </For>
      </ul>
      <Show when={state.error()}><p role="alert" class="text-danger">{state.error()}</p></Show>
      <Show when={state.message()}><p role="status">{state.message()}</p></Show>
    </section>
  )
}

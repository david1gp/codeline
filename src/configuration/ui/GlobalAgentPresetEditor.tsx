import { For, Show } from "solid-js"
import { Checkbox } from "#ui/input/check/Checkbox.jsx"
import { Input } from "#ui/input/input/Input.jsx"
import { Button } from "#ui/interactive/button/Button.jsx"
import { buttonSize, buttonVariant } from "#ui/interactive/button/buttonCva.js"
import { globalAgentPresetEditorStateCreate } from "./globalAgentPresetEditorStateCreate.js"

const categories = [
  { category: "skills", field: "skillSetIds", label: "Skill sets" },
  { category: "commands", field: "commandSetIds", label: "Command sets" },
  { category: "tools", field: "toolSetIds", label: "Tool sets" },
  { category: "subagents", field: "subagentSetIds", label: "Subagent sets" },
] as const

export function GlobalAgentPresetEditor() {
  const state = globalAgentPresetEditorStateCreate()
  return (
    <section class="grid gap-5" aria-labelledby="agent-presets-title">
      <header class="flex flex-wrap items-center justify-between gap-3">
        <div><p class="m-0 text-xs text-accent uppercase">Global configuration</p><h1 id="agent-presets-title" class="m-0 text-2xl font-semibold">Agent presets</h1>
          <p class="m-0 text-faint text-sm">Combine sets and individual subagents for future sessions. Overlapping members appear once.</p></div>
        <Button size={buttonSize.sm} variant={buttonVariant.outline} disabled={!state.document() || state.busy() || state.isDraft()} onClick={() => void state.entryCreate()}>Add preset</Button>
      </header>
      <Show when={state.loading()}><p role="status">Loading agent presets…</p></Show>
      <Show when={state.document()}>
        <p class="m-0 text-sm">Drag a set into the selected preset to assign it, or use the checkboxes below.</p>
        <div class="grid gap-2 sm:grid-cols-2">
          <For each={categories}>{({ category, label }) => <div class="grid gap-1"><strong>{label}</strong>
            <div class="flex min-h-10 flex-wrap gap-2 rounded border border-line p-2" ref={(el) => state.dragListAttach(el, "catalog", `${category}:sets`, () => state.document()?.categories[category].sets.map((set) => `${category}:${set.id}`) ?? [])}>
              <For each={state.document()?.categories[category].sets || []}>{(set) => <span data-drag-member class="cursor-grab rounded bg-surface-hover px-2 py-1 text-sm">{set.name}</span>}</For>
            </div>
          </div>}</For>
        </div>
        <div class="grid grid-cols-[minmax(180px,220px)_minmax(0,1fr)] overflow-hidden rounded-xl border border-line bg-surface-raised max-[700px]:grid-cols-1">
          <nav aria-label="Agent presets" class="grid content-start gap-1 border-r border-line p-2 max-[700px]:border-r-0 max-[700px]:border-b">
            <For each={state.presets()}>{(preset) => <button type="button" class="rounded-md px-3 py-2 text-left hover:bg-surface-hover" aria-pressed={state.selectedId() === preset.id} classList={{ "bg-accent-soft": state.selectedId() === preset.id }} onClick={() => state.select(preset.id)}>{preset.name}</button>}</For>
          </nav>
          <Show when={state.activePreset()} fallback={<p class="p-5 text-faint">Add a preset to begin.</p>}>{(preset) =>
            <div class="grid content-start gap-5 p-5">
              <div class="grid gap-1"><strong>Assigned sets — drop here</strong>
                <div aria-label="Preset sets drop zone" class="flex min-h-12 flex-wrap gap-2 rounded border border-line p-2" ref={(el) => state.dragListAttach(el, "preset", preset().id, () => categories.flatMap(({ category, field }) => preset()[field].map((id) => `${category}:${id}`)))}>
                  <For each={categories.flatMap(({ category, field }) => preset()[field].map((id) => ({ category, id, name: state.document()?.categories[category].sets.find((set) => set.id === id)?.name ?? id })))}>{(item) => <span data-drag-member class="cursor-grab rounded bg-surface-hover px-2 py-1 text-sm">{item.category}: {item.name}</span>}</For>
                </div>
              </div>
              <div class="grid gap-1"><label for="preset-name">Preset name</label><Input id="preset-name" value={state.name()} onInput={state.nameInput} disabled={state.busy()} /></div>
               <div class="grid gap-1"><label for="preset-agent">Execution agent (required)</label><select id="preset-agent" class="rounded border border-line bg-surface p-2" value={state.executionAgentId()} onChange={state.agentInput} disabled={state.busy()} required aria-invalid={!state.executionAgents().includes(state.executionAgentId())}>
                 <option value="">Choose an execution agent</option><For each={state.executionAgents()}>{(agent) => <option value={agent}>{agent}</option>}</For>
               </select><Show when={state.executionAgents().length === 0}><p class="m-0 text-danger text-sm">No configured execution agents are available.</p></Show></div>
                <div class="grid gap-1"><label for="preset-model">Model (required)</label><select id="preset-model" class="rounded border border-line bg-surface p-2" value={state.modelId()} onChange={state.modelInput} disabled={state.busy() || state.modelOptions().length === 0} required aria-invalid={!state.modelOptions().some((model) => model.id === state.modelId())}>
                  <option value="">Choose a model</option><For each={state.modelOptions()}>{(model) => <option value={model.id}>{model.label}</option>}</For>
                </select><Show when={state.modelBlockedReason()}>{(reason) => <p role="alert" class="m-0 text-danger text-sm">{reason()}</p>}</Show></div>
               <div class="flex gap-2"><Button size={buttonSize.sm} disabled={state.busy() || !state.fieldsValid()} onClick={() => void state.entryRename()}>{state.isDraft() ? "Create preset" : "Save preset fields"}</Button>
                <Button size={buttonSize.sm} variant={buttonVariant.outlineRed} disabled={state.busy()} onClick={() => void state.entryDelete()}>Delete preset</Button></div>
               <Show when={state.isDraft()}><p class="m-0 text-faint text-sm">Save the required fields before assigning sets or subagents.</p></Show>
               <For each={categories}>{({ category, field, label }) =>
                 <fieldset class="grid min-h-12 gap-2 border-t border-line pt-3" disabled={state.busy() || state.isDraft()} ref={(el) => state.dragListAttach(el, "preset", preset().id, () => state.document()?.categories[category].sets.map((set) => `${category}:${set.id}`) ?? [])}><legend class="font-medium">{label}</legend>
                  <For each={state.document()?.categories[category].sets || []}>{(set) =>
                    <div data-drag-member>
                      <Checkbox checked={preset()[field].includes(set.id)} onChange={(checked) => void state.presetMembershipChange(field, set.id, checked)}>{set.name}</Checkbox>
                    </div>
                  }</For>
                </fieldset>
              }</For>
               <fieldset class="grid gap-2 border-t border-line pt-3" disabled={state.busy() || state.isDraft()}><legend class="font-medium">Individual subagents</legend>
                <For each={state.individualNames()}>{(resource) =>
                  <Checkbox checked={true} onChange={(checked) => void state.presetMembershipChange("subagentNames", resource, checked)}>{resource}</Checkbox>
                }</For>
                <div class="flex flex-wrap items-end gap-2"><div class="grid flex-1 gap-1"><label for="preset-subagent">Global subagent</label><select id="preset-subagent" class="rounded border border-line bg-surface p-2" value={state.newResource()} onChange={state.resourceInput} disabled={!state.agentsLoaded() || state.busy()}>
                  <option value="">Choose a subagent</option><For each={state.names()}>{(resource) => <option value={resource}>{resource}</option>}</For>
                </select></div>
                  <Button size={buttonSize.sm} variant={buttonVariant.outline} disabled={!state.newResource() || !state.agentsLoaded() || state.busy()} onClick={() => void state.individualAdd()}>Add subagent</Button></div>
              </fieldset>
            </div>
          }</Show>
        </div>
      </Show>
      <Show when={state.error()}><p role="alert" class="text-danger">{state.error()} <Button size={buttonSize.sm} variant={buttonVariant.outline} disabled={state.busy()} onClick={() => void state.load()}>Reload</Button></p></Show>
      <Show when={state.message()}><p role="status">{state.message()}</p></Show>
    </section>
  )
}

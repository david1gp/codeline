import { For, Show } from "solid-js"
import { Checkbox } from "#ui/input/check/Checkbox.jsx"
import { Input } from "#ui/input/input/Input.jsx"
import { Textarea } from "#ui/input/textarea/Textarea.jsx"
import { Button } from "#ui/interactive/button/Button.jsx"
import { buttonSize, buttonVariant } from "#ui/interactive/button/buttonCva.js"
import type { configurationEditorStateCreate } from "./configurationEditorStateCreate.js"
export function ConfigurationEditor(props: { state: ReturnType<typeof configurationEditorStateCreate> }) {
  return (
    <section class="grid min-h-0 gap-5" aria-labelledby={`${props.state.section}-configuration-title`}>
      <header class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="m-0 font-mono text-[10px] tracking-[0.1em] text-accent uppercase">Visual configuration</p>
          <h1 id={`${props.state.section}-configuration-title`} class="mt-1 mb-0 text-2xl font-semibold">
            {props.state.details.label}
          </h1>
          <p class="mt-1 mb-0 text-faint text-sm">{props.state.details.description}</p>
        </div>
        <Button variant={buttonVariant.outline} size={buttonSize.sm} onClick={props.state.entryCreate}>
          Add {props.state.details.itemLabel}
        </Button>
      </header>
      <div class="grid min-h-[430px] grid-cols-[220px_minmax(0,1fr)] overflow-hidden rounded-xl border border-line bg-surface-raised shadow-[0_8px_30px_var(--shadow-color)] max-[700px]:grid-cols-1">
        <div class="border-line border-r bg-surface p-2 max-[700px]:border-r-0 max-[700px]:border-b">
          <p class="m-0 px-2 py-1.5 text-[10px] tracking-[0.08em] text-faint uppercase">
            {props.state.entries().length} configured
          </p>
          <div class="grid gap-1" role="list">
            <For each={props.state.entries()}>
              {(entry) => (
                <button
                  type="button"
                  class="grid min-h-10 w-full gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-hover"
                  classList={{
                    "bg-accent-soft text-accent": props.state.selectedId() === entry.id,
                    "text-faint": props.state.selectedId() !== entry.id,
                  }}
                  aria-pressed={props.state.selectedId() === entry.id}
                  onClick={() => props.state.entrySelect(entry.id)}
                >
                  <span class="truncate font-medium text-xs">{entry.name}</span>
                  <span class="truncate text-[10px] opacity-75">{entry.enabled ? "Enabled" : "Disabled"}</span>
                </button>
              )}
            </For>
          </div>
        </div>
        <Show
          when={props.state.activeEntry()}
          fallback={
            <div class="grid place-items-center p-8 text-center text-faint text-sm">Add an entry to begin.</div>
          }
        >
          {(entry) => (
            <div class="grid content-start gap-5 p-5 max-[640px]:p-4">
              <div class="grid gap-1.5">
                <label class="font-medium text-xs" for={`${props.state.section}-name`}>
                  Name
                </label>
                <Input id={`${props.state.section}-name`} value={entry().name} onInput={props.state.nameInput} />
              </div>
              <div class="grid gap-1.5">
                <label class="font-medium text-xs" for={`${props.state.section}-description`}>
                  Description
                </label>
                <Textarea
                  id={`${props.state.section}-description`}
                  class="min-h-20 text-sm"
                  value={entry().description}
                  onInput={props.state.descriptionInput}
                />
              </div>
              <div class="grid gap-1.5">
                <label class="font-medium text-xs" for={`${props.state.section}-content`}>
                  {props.state.details.contentLabel}
                </label>
                <Textarea
                  id={`${props.state.section}-content`}
                  class="min-h-36 font-mono text-xs leading-5"
                  value={entry().content}
                  onInput={props.state.contentInput}
                />
              </div>
              <div class="flex flex-wrap items-center justify-between gap-3 border-line border-t pt-4">
                <Checkbox checked={entry().enabled} onChange={props.state.enabledChange}>
                  <span class="text-sm">Enabled</span>
                </Checkbox>
                <Button variant={buttonVariant.outlineRed} size={buttonSize.sm} onClick={props.state.entryDelete}>
                  Delete
                </Button>
              </div>
            </div>
          )}
        </Show>
      </div>
      <footer class="flex flex-wrap items-center justify-between gap-3 text-faint text-xs">
        <p class="m-0">{props.state.storageMessage()}</p>
        <Button variant={buttonVariant.ghost} size={buttonSize.sm} onClick={props.state.entriesReset}>
          Restore fixture defaults
        </Button>
      </footer>
    </section>
  )
}

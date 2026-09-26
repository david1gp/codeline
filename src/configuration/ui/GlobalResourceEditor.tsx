import { For, Show } from "solid-js"
import { Input } from "#ui/input/input/Input.jsx"
import { Textarea } from "#ui/input/textarea/Textarea.jsx"
import { Button } from "#ui/interactive/button/Button.jsx"
import { buttonSize, buttonVariant } from "#ui/interactive/button/buttonCva.js"
import type { GlobalResourceKind } from "../client/globalResourceClientCreate.js"
import { globalResourceEditorStateCreate } from "./globalResourceEditorStateCreate.js"

export function GlobalResourceEditor(props: { kind: GlobalResourceKind }) {
  const state = globalResourceEditorStateCreate(props.kind)
  return (
    <section class="grid min-h-0 gap-5" aria-labelledby={`${props.kind}-configuration-title`}>
      <header class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="m-0 font-mono text-[10px] tracking-[0.1em] text-accent uppercase">Global source files</p>
          <h1 id={`${props.kind}-configuration-title`} class="mt-1 mb-0 text-2xl font-semibold">
            {props.kind === "skills" ? "Skills" : "Commands"}
          </h1>
          <p class="mt-1 mb-0 text-faint text-sm">
            Edit the global {props.kind === "skills" ? "SKILL.md" : ".md"} files used by Codeline. Project-local
            resources are not edited here.
          </p>
        </div>
        <Button variant={buttonVariant.outline} size={buttonSize.sm} disabled={state.busy()} onClick={state.entryNew}>
          Add {props.kind === "skills" ? "skill" : "command"}
        </Button>
      </header>
      <div class="grid min-h-[430px] grid-cols-[minmax(190px,220px)_minmax(0,1fr)] overflow-hidden rounded-xl border border-line bg-surface-raised shadow-[0_8px_30px_var(--shadow-color)] max-[700px]:grid-cols-1">
        <div class="border-line border-r bg-surface-sunken p-2 max-[700px]:border-r-0 max-[700px]:border-b">
          <p class="m-0 px-2 py-1.5 text-[10px] tracking-[0.08em] text-subtle uppercase">
            {state.names().length} global {props.kind}
          </p>
          <Show when={state.listing()}>
            <p role="status" class="px-2 text-faint text-sm">
              Loading global {props.kind}…
            </p>
          </Show>
          <ul class="m-0 grid list-none gap-1 p-0">
            <For each={state.names()}>
              {(name) => (
                <li>
                  <button
                    type="button"
                    class="min-h-11 w-full rounded-md border border-transparent px-2.5 py-2 text-left text-sm hover:border-line hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent-border"
                    classList={{ "border-accent-border bg-accent-soft": state.selected() === name }}
                    aria-pressed={state.selected() === name}
                    onClick={() => void state.entrySelect(name)}
                  >
                    {name}
                  </button>
                </li>
              )}
            </For>
          </ul>
        </div>
        <div class="grid content-start gap-5 p-5 max-[640px]:p-4">
          <Show when={state.loading()}>
            <p role="status" class="text-faint text-sm">
              Loading source file…
            </p>
          </Show>
          <div class="grid gap-1.5">
            <label class="font-medium text-xs" for={`${props.kind}-name`}>
              Name
            </label>
            <Input
              id={`${props.kind}-name`}
              class="border-line bg-surface text-foreground"
              value={state.name()}
              disabled={state.selected() !== undefined || state.busy() || state.loading()}
              onInput={state.nameInput}
              placeholder={props.kind === "skills" ? "my-skill" : "my-command"}
            />
            <Show when={state.selected()}>
              <p class="m-0 text-faint text-xs">
                Names cannot be changed in place. Create a new entry and delete the old one to rename.
              </p>
            </Show>
          </div>
          <div class="grid gap-1.5">
            <label class="font-medium text-xs" for={`${props.kind}-content`}>
              Source content (including YAML frontmatter)
            </label>
            <Textarea
              id={`${props.kind}-content`}
              class="min-h-64 resize-y border-line bg-surface font-mono text-xs leading-5 text-foreground"
              value={state.content()}
              disabled={state.busy() || state.loading()}
              onInput={state.contentInput}
              placeholder={
                props.kind === "skills"
                  ? "---\nname: my-skill\ndescription: What this skill does\n---\n\nInstructions…"
                  : "---\ndescription: What this command does\n---\n\nInstructions…"
              }
            />
          </div>
          <div class="flex flex-wrap items-center justify-between gap-3 border-line border-t pt-4">
            <Button
              variant={buttonVariant.outlineRed}
              size={buttonSize.sm}
              disabled={!state.selected() || state.busy() || state.loading()}
              onClick={() => void state.entryDelete()}
            >
              Delete
            </Button>
            <Button
              size={buttonSize.sm}
              disabled={state.busy() || state.loading() || !state.dirty()}
              onClick={() => void state.entrySave()}
            >
              {state.busy() ? "Saving…" : "Save source file"}
            </Button>
          </div>
        </div>
      </div>
      <Show when={state.error()}>
        <p role="alert" class="m-0 text-danger text-sm">
          {state.error()}
        </p>
      </Show>
      <Show when={state.error() && !state.dirty()}>
        <Button variant={buttonVariant.outline} size={buttonSize.sm} onClick={() => void state.listLoad()}>
          Retry loading
        </Button>
      </Show>
      <Show when={state.message()}>
        <p role="status" class="m-0 text-sm">
          {state.message()}
        </p>
      </Show>
    </section>
  )
}

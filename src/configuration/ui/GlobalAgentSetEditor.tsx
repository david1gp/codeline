import { For, Show } from "solid-js"
import { Checkbox } from "#ui/input/check/Checkbox.jsx"
import { Input } from "#ui/input/input/Input.jsx"
import { Button } from "#ui/interactive/button/Button.jsx"
import { buttonSize, buttonVariant } from "#ui/interactive/button/buttonCva.js"
import Dialog from "@corvu/dialog"
import { classesDialogContentMerge, classesDialogOverlayMerge } from "#ui/interactive/dialog/classesDialogContent.js"
import type { GlobalAgentPresetResourceCategory } from "../globalAgentPresetResourcesResolve.js"
import { globalAgentPresetResourcesResolve } from "../globalAgentPresetResourcesResolve.js"
import { globalAgentPresetEditorStateCreate } from "./globalAgentPresetEditorStateCreate.js"

const labels = { skills: "Skill", commands: "Command", tools: "Tool", subagents: "Subagent" }

export function GlobalAgentSetEditor(props: { category: GlobalAgentPresetResourceCategory }) {
  const state = globalAgentPresetEditorStateCreate(props.category)
  return (
    <section class="grid gap-5" aria-labelledby="global-set-title">
      <header class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="m-0 text-xs text-accent uppercase">Global configuration</p>
          <h1 id="global-set-title" class="m-0 text-2xl font-semibold">
            {labels[props.category]} sets
          </h1>
          <p class="m-0 text-faint text-sm">
            A resource can belong to multiple sets. Removing membership does not delete the resource.
          </p>
        </div>
        <Button
          size={buttonSize.sm}
          variant={buttonVariant.outline}
          disabled={!state.document() || state.busy()}
          onClick={() => void state.entryCreate()}
        >
          Add set
        </Button>
      </header>
      <Show when={state.loading()}>
        <p role="status">Loading global sets…</p>
      </Show>
      <Show when={state.document()}>
        <div class="grid gap-2">
          <p class="m-0 text-sm">
            Drag a resource from the catalog onto a set, between sets to copy or move, or outside to remove its
            membership. Use the checkboxes below without dragging.
          </p>
          <div class="grid gap-1">
            <strong>Resource catalog</strong>
            <div
              class="flex flex-wrap gap-2 min-h-10 rounded border border-line p-2"
              ref={(el) => state.dragListAttach(el, "catalog", "catalog", state.availableNames)}
            >
              <For each={state.availableNames()}>
                {(resource) => (
                  <span data-drag-member class="cursor-grab rounded bg-surface-hover px-2 py-1 font-mono text-sm">
                    {resource}
                  </span>
                )}
              </For>
            </div>
          </div>
          <div class="grid gap-2 sm:grid-cols-2">
            <For each={state.sets()}>
              {(set) => (
                <div class="grid gap-1">
                  <strong>{set.name}</strong>
                  <div
                    aria-label={`${set.name} members drop zone`}
                    class="flex min-h-12 flex-wrap gap-2 rounded border border-line p-2"
                    ref={(el) =>
                      state.dragListAttach(el, "set", set.id, () =>
                        state.document()
                          ? globalAgentPresetResourcesResolve(
                              state.document()!,
                              props.category,
                              [set.id],
                              state.names(),
                            )
                          : [],
                      )
                    }
                  >
                    <For
                      each={
                        state.document()
                          ? globalAgentPresetResourcesResolve(
                              state.document()!,
                              props.category,
                              [set.id],
                              state.names(),
                            )
                          : []
                      }
                    >
                      {(resource) => (
                        <span data-drag-member class="cursor-grab rounded bg-surface-hover px-2 py-1 font-mono text-sm">
                          {resource}
                        </span>
                      )}
                    </For>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
        <div class="grid grid-cols-[minmax(180px,220px)_minmax(0,1fr)] overflow-hidden rounded-xl border border-line bg-surface-raised max-[700px]:grid-cols-1">
          <nav
            aria-label={`${labels[props.category]} sets`}
            class="grid content-start gap-1 border-r border-line p-2 max-[700px]:border-r-0 max-[700px]:border-b"
          >
            <For each={state.sets()}>
              {(set) => (
                <button
                  type="button"
                  class="rounded-md px-3 py-2 text-left hover:bg-surface-hover"
                  aria-pressed={state.selectedId() === set.id}
                  classList={{ "bg-accent-soft": state.selectedId() === set.id }}
                  onClick={() => state.select(set.id)}
                >
                  {set.name} {state.document()?.categories[props.category].defaultSetId === set.id ? "(default)" : ""}
                </button>
              )}
            </For>
          </nav>
          <Show when={state.activeSet()}>
            {(set) => (
              <div class="grid content-start gap-5 p-5">
                <div class="flex flex-wrap items-end gap-2">
                  <div class="grid flex-1 gap-1">
                    <label for="set-name">Set name</label>
                    <Input id="set-name" value={state.name()} onInput={state.nameInput} disabled={state.busy()} />
                  </div>
                  <Button
                    size={buttonSize.sm}
                    disabled={state.busy() || !state.name().trim()}
                    onClick={() => void state.entryRename()}
                  >
                    Save name
                  </Button>
                </div>
                <div class="flex flex-wrap items-center gap-3">
                  <Button
                    size={buttonSize.sm}
                    variant={buttonVariant.outline}
                    disabled={state.busy() || state.document()?.categories[props.category].defaultSetId === set().id}
                    onClick={() => void state.defaultChoose()}
                  >
                    Make default
                  </Button>
                  <Button
                    size={buttonSize.sm}
                    variant={buttonVariant.outlineRed}
                    disabled={state.busy() || state.document()?.categories[props.category].defaultSetId === set().id}
                    onClick={() => void state.entryDelete()}
                  >
                    Delete set
                  </Button>
                </div>
                <fieldset class="grid gap-2 border-t border-line pt-4" disabled={state.busy()}>
                  <legend class="font-medium">Members</legend>
                  <Show
                    when={
                      props.category === "commands" && state.document()?.categories.commands.defaultSetId === set().id
                    }
                  >
                    <p class="text-faint text-sm">
                      The default command set includes all global commands unless you uncheck them here.
                    </p>
                  </Show>
                  <For each={state.availableNames()}>
                    {(resource) => (
                      <Checkbox
                        checked={state.selectedNames().includes(resource)}
                        onChange={(checked) => void state.membershipChange(resource, checked)}
                      >
                        <span class="font-mono text-sm">{resource}</span>
                      </Checkbox>
                    )}
                  </For>
                  <Show when={props.category === "subagents"}>
                    <div class="flex flex-wrap items-end gap-2">
                      <div class="grid flex-1 gap-1">
                        <label for="set-subagent">Global subagent</label>
                        <select
                          id="set-subagent"
                          class="rounded border border-line bg-surface p-2"
                          value={state.newResource()}
                          onChange={state.resourceInput}
                          disabled={!state.agentsLoaded() || state.busy()}
                        >
                          <option value="">Choose a subagent</option>
                          <For each={state.names()}>{(resource) => <option value={resource}>{resource}</option>}</For>
                        </select>
                      </div>
                      <Button
                        size={buttonSize.sm}
                        variant={buttonVariant.outline}
                        disabled={!state.newResource() || !state.agentsLoaded() || state.busy()}
                        onClick={() => void state.resourceAdd()}
                      >
                        Add member
                      </Button>
                    </div>
                  </Show>
                </fieldset>
              </div>
            )}
          </Show>
        </div>
      </Show>
      <Dialog
        open={!!state.pendingMove()}
        onOpenChange={(open) => {
          if (!open) state.transferCancel()
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay class={classesDialogOverlayMerge()} />
          <Dialog.Content class={classesDialogContentMerge()}>
            <Dialog.Label class="text-lg font-semibold">Copy or move member?</Dialog.Label>
            <Dialog.Description class="my-3">
              Add {state.pendingMove()?.resource} to{" "}
              {state.sets().find((set) => set.id === state.pendingMove()?.targetId)?.name}. Copy keeps it in the
              original set; Move removes that membership.
            </Dialog.Description>
            <div class="flex gap-2">
              <Button disabled={state.busy()} onClick={() => void state.transferConfirm("copy")}>
                Copy
              </Button>
              <Button disabled={state.busy()} onClick={() => void state.transferConfirm("move")}>
                Move
              </Button>
              <Button variant={buttonVariant.outline} disabled={state.busy()} onClick={state.transferCancel}>
                Cancel
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
      <Show when={state.error()}>
        <p role="alert" class="text-danger">
          {state.error()}{" "}
          <Button
            size={buttonSize.sm}
            variant={buttonVariant.outline}
            disabled={state.busy()}
            onClick={() => void state.load()}
          >
            Reload
          </Button>
        </p>
      </Show>
      <Show when={state.message()}>
        <p role="status">{state.message()}</p>
      </Show>
    </section>
  )
}

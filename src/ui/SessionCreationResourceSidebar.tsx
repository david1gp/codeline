import { For, Match, Show, Switch } from "solid-js"
import { SelectMultiple } from "#ui/input/select/SelectMultiple.jsx"
import { SelectSingleNative } from "#ui/input/select/SelectSingleNative.jsx"
import { Button } from "#ui/interactive/button/Button.jsx"
import { buttonVariant } from "#ui/interactive/button/buttonCva.js"
import type { applicationShellStateCreate } from "./applicationShellStateCreate.js"
import { SessionCreationContextPopover } from "./SessionCreationContextPopover.js"
import type { SessionCreationResourceControl } from "./sessionCreationResourceControlsStateCreate.js"
import { sessionCreationResourceControlsStateCreate } from "./sessionCreationResourceControlsStateCreate.js"
import type { SessionResourceSelectorView } from "./sessionResourceSelectorView.js"

const sessionContextFallbackWidth = 320
const sectionLabelClass = "m-0 text-[11px] font-semibold tracking-[0.08em] text-faint uppercase"
const selectClass = "!w-full !items-stretch !border-line !bg-surface !px-1.5 !py-1.5"
const selectButtonClass = "!w-full !justify-start !px-2 !py-1 !text-xs !text-faint"
const selectOptionClass = "!px-2 !py-1 !text-xs"

export function SessionCreationResourceSidebar(props: {
  idPrefix?: string
  shell?: ReturnType<typeof applicationShellStateCreate>
  state: SessionResourceSelectorView
}) {
  const prefix = () => props.idPrefix ?? "session-creation-resources"
  const controls = sessionCreationResourceControlsStateCreate(() => props.state)
  const width = () => props.shell?.sessionContextWidth() ?? sessionContextFallbackWidth

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
            aria-valuenow={width()}
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
        style={{ "--session-context-width": `${width()}px` }}
        aria-labelledby={`${prefix()}-heading`}
      >
        <div>
          <p class={sectionLabelClass}>Session context</p>
          <h3 id={`${prefix()}-heading`} class="m-0 mt-1 text-sm font-semibold tracking-[-0.01em]">
            Skills and tools
          </h3>
        </div>

        <Switch>
          <Match when={props.state.status() === "offline"}>
            <p class="m-0 text-xs text-faint" role="status">
              Offline. Defaults apply to the new session.
            </p>
          </Match>
          <Match when={props.state.status() === "idle"}>
            <p class="m-0 text-xs text-faint">Select a project to configure skills and tools.</p>
          </Match>
          <Match when={props.state.status() === "loading"}>
            <p class="m-0 text-xs text-faint" role="status">
              Loading skills and tools…
            </p>
          </Match>
          <Match when={props.state.status() === "error"}>
            <div class="grid gap-2" role="alert">
              <p class="m-0 text-xs text-danger">
                {props.state.errorMessage() ?? "Skills and tools could not be loaded."}
              </p>
              <Button variant="outlineRed" size="sm" onClick={props.state.retry}>
                Retry
              </Button>
            </div>
          </Match>
          <Match when={true}>
            <label class="grid gap-1.5" for={`${prefix()}-preset`}>
              <span class={sectionLabelClass}>Skill preset</span>
              <SelectSingleNative
                id={`${prefix()}-preset`}
                class="!rounded-md !border !border-line !bg-surface !px-2 !py-1.5 !text-xs !text-foreground"
                valueSignal={controls.preset}
                getOptions={controls.presetOptions}
                valueText={controls.presetOptionText}
              />
              <span class="text-[11px] text-faint">
                {controls.isAllPreset()
                  ? "All discovered skills are included."
                  : props.state.presetSource() === "override"
                    ? "Applies to this session only."
                    : "Your saved project default."}
              </span>
            </label>

            <SessionCreationResourceGroup
              control={controls.skillGroups}
              disabled={controls.isAllPreset()}
              emptyText="No skill groups were discovered."
              helperText={controls.isAllPreset() ? "All discovered skill groups are included." : undefined}
              id={`${prefix()}-skill-groups`}
              label="Skill groups"
            />
            <SessionCreationResourceGroup
              control={controls.skills}
              disabled={controls.isAllPreset()}
              emptyText="No individual skills are selectable."
              helperText={controls.isAllPreset() ? "All discovered skills are included." : undefined}
              id={`${prefix()}-skills`}
              label="Skills"
            />
            <SessionCreationResourceGroup
              control={controls.tools}
              emptyText="No agent tools are available."
              id={`${prefix()}-tools`}
              label="Tools"
            />

            <div class="grid gap-1.5">
              <p class={sectionLabelClass}>Prompt and context</p>
              <SessionCreationContextPopover idPrefix={`${prefix()}-context`} state={props.state} />
            </div>

            <p class="m-0 text-[11px] text-faint">
              {props.state.activeSkills().length} active skills · about{" "}
              {props.state.descriptionCatalog().estimatedTokens} tokens of catalog context (estimate)
            </p>
            <p class="m-0 text-[11px] text-faint">Changes apply to the new session only.</p>
          </Match>
        </Switch>
      </aside>
    </>
  )
}

function SessionCreationResourceGroup(props: {
  control: SessionCreationResourceControl
  disabled?: boolean
  emptyText: string
  helperText?: string
  id: string
  label: string
}) {
  return (
    <div class="grid gap-1.5">
      <div class="flex items-baseline justify-between gap-2">
        <p class={sectionLabelClass}>{props.label}</p>
        <Show when={props.helperText !== undefined}>
          <span class="text-[11px] text-faint">{props.helperText}</span>
        </Show>
      </div>
      <Show
        when={props.control.options().length > 0}
        fallback={<p class="m-0 text-xs text-faint">{props.emptyText}</p>}
      >
        <Show
          when={!props.disabled}
          fallback={
            <Show
              when={props.control.valueSignal.get().length > 0}
              fallback={<p class="m-0 text-xs text-faint">{props.emptyText}</p>}
            >
              <div
                id={props.id}
                class="flex flex-wrap gap-1 rounded-md border border-line bg-surface p-1.5"
                role="list"
                aria-label={props.label}
              >
                <For each={props.control.valueSignal.get()}>
                  {(item) => (
                    <span
                      class="inline-flex items-center rounded-md border border-line-subtle bg-surface-raised px-2 py-1 text-xs text-strong"
                      role="listitem"
                    >
                      {props.control.optionText(item)}
                    </span>
                  )}
                </For>
              </div>
            </Show>
          }
        >
          <SelectMultiple
            id={props.id}
            class={selectClass}
            addEntryClass={selectButtonClass}
            listOptionClass={selectOptionClass}
            innerClass="grid max-h-[45vh] grid-cols-1 gap-1 overflow-y-auto"
            textAddEntry={`Choose ${props.label.toLowerCase()}`}
            buttonProps={{
              buttonChildren: <span>{`Choose ${props.label.toLowerCase()}`}</span>,
              variant: buttonVariant.outline,
            }}
            valueSignal={props.control.valueSignal}
            getOptions={props.control.options}
            valueText={props.control.optionText}
          />
        </Show>
      </Show>
    </div>
  )
}

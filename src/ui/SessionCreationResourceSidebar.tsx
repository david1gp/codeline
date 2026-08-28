import { Match, Show, Switch } from "solid-js"
import { SelectMultiple } from "#ui/input/select/SelectMultiple.jsx"
import { SelectSingleNative } from "#ui/input/select/SelectSingleNative.jsx"
import { Button } from "#ui/interactive/button/Button.jsx"
import { buttonVariant } from "#ui/interactive/button/buttonCva.js"
import { SessionCreationContextPopover } from "./SessionCreationContextPopover.js"
import type { SessionCreationResourceControl } from "./sessionCreationResourceControlsStateCreate.js"
import { sessionCreationResourceControlsStateCreate } from "./sessionCreationResourceControlsStateCreate.js"
import type { SessionResourceSelectorView } from "./sessionResourceSelectorView.js"

const sectionLabelClass = "m-0 text-[11px] font-semibold tracking-[0.08em] text-faint uppercase"
const selectClass = "!w-full !items-stretch !border-line !bg-surface !px-1.5 !py-1.5"
const selectButtonClass = "!w-full !justify-start !px-2 !py-1 !text-xs !text-faint"
const selectOptionClass = "!px-2 !py-1 !text-xs"

export function SessionCreationResourceSidebar(props: { idPrefix?: string; state: SessionResourceSelectorView }) {
  const prefix = () => props.idPrefix ?? "session-creation-resources"
  const controls = sessionCreationResourceControlsStateCreate(() => props.state)

  return (
    <aside
      class="flex w-[260px] shrink-0 flex-col gap-4 overflow-y-auto border-line-subtle border-l px-4 py-4 max-[1100px]:w-full max-[1100px]:border-l-0 max-[1100px]:border-t"
      aria-labelledby={`${prefix()}-heading`}
    >
      <div>
        <p class={sectionLabelClass}>Session context</p>
        <h3 id={`${prefix()}-heading`} class="m-0 mt-1 text-sm font-semibold tracking-[-0.01em]">
          Skills and tools
        </h3>
      </div>

      <label class="grid gap-1.5" for={`${prefix()}-project`}>
        <span class={sectionLabelClass}>Project</span>
        <SelectSingleNative
          id={`${prefix()}-project`}
          class="!rounded-md !border !border-line !bg-surface !px-2 !py-1.5 !text-xs !text-foreground"
          valueSignal={controls.project}
          getOptions={controls.projectOptions}
          valueText={controls.projectOptionText}
        />
      </label>

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
              getOptions={() => props.state.presets().map((preset) => preset.name)}
            />
            <span class="text-[11px] text-faint">
              {props.state.presetSource() === "override"
                ? "Applies to this session only."
                : "Your saved project default."}
            </span>
          </label>

          <SessionCreationResourceGroup
            control={controls.skillGroups}
            emptyText="No skill groups were discovered."
            id={`${prefix()}-skill-groups`}
            label="Skill groups"
          />
          <SessionCreationResourceGroup
            control={controls.skills}
            emptyText="No individual skills are selectable."
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
            {props.state.activeSkills().length} active skills · about {props.state.descriptionCatalog().estimatedTokens}{" "}
            tokens of catalog context (estimate)
          </p>
          <p class="m-0 text-[11px] text-faint">Changes apply to the new session only.</p>
        </Match>
      </Switch>
    </aside>
  )
}

function SessionCreationResourceGroup(props: {
  control: SessionCreationResourceControl
  emptyText: string
  id: string
  label: string
}) {
  return (
    <div class="grid gap-1.5">
      <p class={sectionLabelClass}>{props.label}</p>
      <Show
        when={props.control.options().length > 0}
        fallback={<p class="m-0 text-xs text-faint">{props.emptyText}</p>}
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
    </div>
  )
}

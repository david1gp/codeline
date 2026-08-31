import { mdiFolderPlusOutline } from "@adaptive-ds/mdi/mdiFolderPlusOutline.js"
import { For, Show } from "solid-js"
import { Input } from "#ui/input/input/Input.jsx"
import { CorvuPopover } from "#ui/interactive/popover/CorvuPopover.jsx"
import { Icon } from "#ui/static/icon/Icon.jsx"
import type { ActiveProjectState } from "./activeProjectStateCreate.js"
import { NewProjectDialog } from "./NewProjectDialog.js"
import { sessionProjectSelectorStateCreate } from "./sessionProjectSelectorStateCreate.js"
import type { SessionResourceSelectorView } from "./sessionResourceSelectorView.js"

export function SessionProjectSelector(props: {
  activeProject?: ActiveProjectState
  idPrefix: string
  state: SessionResourceSelectorView
}) {
  const state = sessionProjectSelectorStateCreate({
    activeProject: () => props.activeProject,
    idPrefix: () => props.idPrefix,
    resources: () => props.state,
  })

  return (
    <div class="grid w-full min-w-0 gap-1.5" id={props.idPrefix}>
      <CorvuPopover
        class="!w-full !justify-between !rounded-md !border !border-line !bg-surface !px-2 !py-1.5 !text-xs !text-foreground font-normal"
        innerClass="grid w-[min(92vw,22rem)] gap-2"
        buttonChildren={
          <>
            <span class="sr-only">Project: </span>
            <span class="truncate">{state.triggerLabel()}</span>
          </>
        }
        open={state.open()}
        onOpenChange={state.openChange}
        size="none"
        variant="none"
      >
        <Input
          id={state.searchId()}
          class="!w-full !py-1.5 !text-xs"
          type="search"
          autocomplete="off"
          placeholder="Search projects…"
          aria-label="Search projects"
          aria-controls={state.listboxId()}
          value={state.search()}
          onInput={state.searchInput}
          onKeyDown={state.searchKeyDown}
          ref={state.searchRef}
        />
        <div
          id={state.listboxId()}
          class="grid max-h-[45vh] grid-cols-1 gap-0.5 overflow-y-auto"
          role="listbox"
          aria-label="Registered projects"
        >
          <For
            each={state.projectOptions()}
            fallback={<p class="m-0 px-2 py-2 text-xs text-faint">{state.emptyText()}</p>}
          >
            {(entry) => (
              <Show
                when={entry.type === "item" ? entry : undefined}
                fallback={
                  <p class="m-0 px-2 pt-2 text-[11px] font-semibold tracking-[0.08em] text-faint uppercase">
                    {entry.type === "group" ? entry.label : ""}
                  </p>
                }
              >
                {(item) => (
                  <button
                    class="min-w-0 rounded-md px-2 py-1.5 text-left text-xs text-foreground hover:bg-surface-raised aria-selected:font-semibold"
                    type="button"
                    role="option"
                    aria-selected={state.isSelected(item().value)}
                    onClick={() => state.projectSelect(item().value)}
                    onKeyDown={state.optionKeyDown}
                  >
                    <span class="block truncate">{state.projectLabel(item().value)}</span>
                  </button>
                )}
              </Show>
            )}
          </For>
        </div>
        <button
          class="flex min-w-0 items-center gap-2 rounded-md border border-line-subtle px-2 py-1.5 text-left text-xs text-foreground hover:bg-surface-raised"
          type="button"
          onClick={state.newProjectStart}
        >
          <Icon path={mdiFolderPlusOutline} class="size-4 shrink-0" />
          <span class="truncate">New Project</span>
        </button>
      </CorvuPopover>
      <NewProjectDialog
        activeProject={state.activeProject()}
        buttonClass="hidden"
        idPrefix={`${props.idPrefix}-new-project`}
        onProjectConfirmed={state.newProjectConfirmed}
        onOpenChange={state.newProjectOpenChange}
        open={state.newProjectOpen}
      />
    </div>
  )
}

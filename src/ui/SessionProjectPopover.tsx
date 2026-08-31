import { mdiFolderPlusOutline } from "@adaptive-ds/mdi/mdiFolderPlusOutline.js"
import Popover from "@corvu/popover"
import { For } from "solid-js"
import { Input } from "#ui/input/input/Input.jsx"
import { buttonCva2, buttonSize, buttonVariant } from "#ui/interactive/button/buttonCva.js"
import { classesButtonClickAnimation } from "#ui/interactive/button/classesButtonClickAnimation.js"
import { classesPopoverContentMerge } from "#ui/interactive/popover/classesPopoverContent.js"
import { Icon } from "#ui/static/icon/Icon.jsx"
import { ProjectAvatar } from "../project/ui/ProjectAvatar.js"
import { projectFolderIconSelect } from "../project/ui/projectFolderIconSelect.js"
import { sessionProjectPopoverStateCreate } from "./sessionProjectPopoverStateCreate.js"
import type { SessionResourceSelectorView } from "./sessionResourceSelectorView.js"

export function SessionProjectPopover(props: {
  idPrefix: string
  onNewProject: () => void
  state: SessionResourceSelectorView
}) {
  const state = sessionProjectPopoverStateCreate({
    idPrefix: () => props.idPrefix,
    onNewProject: props.onNewProject,
    resources: () => props.state,
  })

  return (
    <Popover
      floatingOptions={{ flip: true, offset: 8, shift: true }}
      finalFocusEl={state.triggerElement()}
      open={state.open()}
      onFinalFocus={state.popoverFinalFocus}
      onOpenChange={state.openChange}
    >
      <Popover.Trigger
        ref={state.triggerRef}
        class={buttonCva2(
          buttonVariant.none,
          buttonSize.none,
          classesButtonClickAnimation,
          "!w-full !justify-between !rounded-md !border !border-line !bg-surface !px-2 !py-1.5 !text-xs !text-foreground font-normal",
        )}
      >
        <span class="sr-only">Project: </span>
        <span class="truncate">{state.triggerLabel()}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content class={classesPopoverContentMerge("grid w-[min(92vw,22rem)] gap-2")}>
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
              each={state.projectGroups()}
              fallback={<p class="m-0 px-2 py-2 text-xs text-faint">{state.emptyText()}</p>}
            >
              {(group) => (
                <div role="group" aria-label={group.label}>
                  <div class="flex min-h-9 min-w-0 items-center gap-2 px-2 text-xs font-semibold text-strong">
                    <Icon path={projectFolderIconSelect(false)} class="size-4 shrink-0 text-faint" />
                    <span class="truncate" title={group.label}>
                      {group.label}
                    </span>
                  </div>
                  <div class="ml-3 border-line-subtle border-l">
                    <For each={group.projects}>
                      {(project) => (
                        <button
                          class="flex min-h-9 w-full min-w-0 items-center gap-2 rounded-md px-3 py-1.5 text-left text-xs text-foreground hover:bg-surface-raised aria-selected:font-semibold"
                          type="button"
                          role="option"
                          aria-selected={state.isSelected(project.id)}
                          onClick={() => state.projectSelect(project.id)}
                          onKeyDown={state.optionKeyDown}
                        >
                          <ProjectAvatar name={project.label} faviconUrl={project.faviconUrl} />
                          <span class="block truncate" title={project.label}>
                            {project.label}
                          </span>
                        </button>
                      )}
                    </For>
                  </div>
                </div>
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
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  )
}

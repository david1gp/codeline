import Popover from "@corvu/popover"
import { buttonCva2, buttonSize, buttonVariant } from "#ui/interactive/button/buttonCva.js"
import { classesButtonClickAnimation } from "#ui/interactive/button/classesButtonClickAnimation.js"
import { classesPopoverContentMerge } from "#ui/interactive/popover/classesPopoverContent.js"
import { Icon } from "#ui/static/icon/Icon.jsx"
import { ProjectAvatar } from "../../project/ui/ProjectAvatar.js"
import { applicationIcon } from "../../ui/applicationIcon.js"
import { SearchablePicker } from "../../ui/SearchablePicker.js"
import { sessionProjectPopoverStateCreate } from "./sessionProjectPopoverStateCreate.js"
import type { SessionResourceSelectorView } from "./sessionResourceSelectorView.js"

export function SessionProjectPopover(props: {
  idPrefix: string
  onNewProject: () => void
  state: SessionResourceSelectorView
}) {
  const state = sessionProjectPopoverStateCreate({
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
          <SearchablePicker
            active={state.open()}
            ariaLabel="Registered projects"
            emptyText={state.emptyText()}
            idPrefix={props.idPrefix}
            items={state.projectItems()}
            onSelect={(project) => state.projectSelect(project.id)}
            placeholder="Search projects…"
            selectedId={state.selectedProjectId()}
            renderLeading={(project) => (
              <ProjectAvatar class="size-5" name={project.label} faviconUrl={project.faviconUrl} />
            )}
          />
          <button
            class="flex min-w-0 items-center gap-2 rounded-md border border-line-subtle px-2 py-1.5 text-left text-xs text-foreground hover:bg-surface-raised"
            type="button"
            onClick={state.newProjectStart}
          >
            <Icon path={applicationIcon.projectCreate} class="size-4 shrink-0" />
            <span class="truncate">New Project</span>
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  )
}

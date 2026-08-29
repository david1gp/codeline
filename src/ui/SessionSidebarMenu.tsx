import { mdiDotsHorizontal } from "@adaptive-ds/mdi/mdiDotsHorizontal.js"
import { Show } from "solid-js"
import { Button } from "#ui/interactive/button/Button.jsx"
import { buttonVariant } from "#ui/interactive/button/buttonCva.js"
import { CorvuPopoverIcon } from "#ui/interactive/popover/CorvuPopoverIcon.jsx"

export function SessionSidebarMenu(props: {
  ariaLabel: string
  deleteLabel?: string
  onDelete?: () => void
  onMove?: () => void
  onRename?: () => void
}) {
  return (
    <CorvuPopoverIcon
      class="size-6 shrink-0 rounded-md text-faint hover:bg-surface-hover hover:text-strong"
      icon={mdiDotsHorizontal}
      iconClass="size-3.5 fill-current text-faint dark:fill-current"
      title={props.ariaLabel}
      aria-label={props.ariaLabel}
      variant={buttonVariant.ghost}
      innerClass="grid min-w-36 gap-1 border border-line bg-surface-raised p-1 text-foreground shadow-lg"
      onClick={(event) => {
        event.stopPropagation()
      }}
    >
      <Show when={props.onRename !== undefined}>
        <Button
          class="h-8 justify-start px-2 text-xs font-normal"
          variant={buttonVariant.ghost}
          onClick={props.onRename}
        >
          Rename
        </Button>
      </Show>
      <Show when={props.onMove !== undefined}>
        <Button class="h-8 justify-start px-2 text-xs font-normal" variant={buttonVariant.ghost} onClick={props.onMove}>
          Move
        </Button>
      </Show>
      <Show when={props.onDelete !== undefined}>
        <Button
          class="h-8 justify-start px-2 text-xs font-normal text-danger"
          variant={buttonVariant.ghost}
          onClick={props.onDelete}
        >
          {props.deleteLabel ?? "Delete"}
        </Button>
      </Show>
    </CorvuPopoverIcon>
  )
}

import { buttonSize, buttonVariant } from "#ui/interactive/button/buttonCva.js"
import { CorvuPopoverIcon } from "#ui/interactive/popover/CorvuPopoverIcon.jsx"
import { Icon } from "#ui/static/icon/Icon.jsx"
import { For, Show } from "solid-js"
import { connectionStatusKind } from "./connectionStatusKind.js"
import type { ConnectionStatusView } from "./connectionStatusView.js"

export function ConnectionStatusIndicator(props: { state: ConnectionStatusView }) {
  return (
    <CorvuPopoverIcon
      icon={props.state.icon()}
      title={
        props.state.durationLabel() ? `${props.state.label()} ${props.state.durationLabel()}` : props.state.label()
      }
      variant={props.state.isError() ? buttonVariant.outlineRed : buttonVariant.outline}
      size={buttonSize.none}
      class="size-9 rounded-lg"
      classList={{
        "border-danger text-danger": props.state.isError(),
        "border-line text-success": !props.state.isError() && props.state.kind() === connectionStatusKind.ok,
        "border-line text-warning": !props.state.isError() && props.state.kind() !== connectionStatusKind.ok,
      }}
      iconClass="size-4 fill-current dark:fill-current"
      innerClass="min-w-[240px] bg-surface-raised text-foreground"
      open={props.state.popoverOpen()}
      onOpenChange={props.state.popoverOpenChange}
    >
      <ul class="grid gap-2.5 text-xs">
        <For each={props.state.details()}>
          {(line) => (
            <li class="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2">
              <Icon path={line.icon} class="mt-0.5 size-4 fill-current dark:fill-current" />
              <span class="grid gap-0.5">
                <span class="font-medium text-foreground">{line.label}</span>
                <Show
                  when={
                    (line.kind === connectionStatusKind.offline || line.kind === connectionStatusKind.error) &&
                    line.disconnectedSince !== undefined
                  }
                >
                  <span class="text-faint">Disconnected {props.state.durationFor(line.disconnectedSince)}</span>
                </Show>
              </span>
            </li>
          )}
        </For>
      </ul>
    </CorvuPopoverIcon>
  )
}

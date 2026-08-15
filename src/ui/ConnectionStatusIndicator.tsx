import { For, Show } from "solid-js"
import { buttonVariant } from "#ui/interactive/button/buttonCva.js"
import { CorvuPopoverIcon } from "#ui/interactive/popover/CorvuPopoverIcon.jsx"
import { Icon } from "#ui/static/icon/Icon.jsx"
import { connectionStatusKind } from "./connectionStatusKind.js"
import type { ConnectionStatusView } from "./connectionStatusView.js"

export function ConnectionStatusIndicator(props: { state: ConnectionStatusView }) {
  return (
    <CorvuPopoverIcon
      icon={props.state.icon()}
      iconClass={`size-4 ${
        props.state.isError()
          ? "fill-danger dark:fill-danger"
          : props.state.kind() === connectionStatusKind.ok
            ? "fill-success dark:fill-success"
            : "fill-warning dark:fill-warning"
      }`}
      title={
        props.state.durationLabel() ? `${props.state.label()} ${props.state.durationLabel()}` : props.state.label()
      }
      aria-label={
        props.state.durationLabel() ? `${props.state.label()} ${props.state.durationLabel()}` : props.state.label()
      }
      variant={props.state.isError() ? buttonVariant.outlineRed : buttonVariant.outline}
      innerClass="min-w-[240px] border border-line bg-surface-raised text-foreground shadow-lg"
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

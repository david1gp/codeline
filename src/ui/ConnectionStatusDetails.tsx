import { For, Show } from "solid-js"
import { Icon } from "#ui/static/icon/Icon.jsx"
import { connectionStatusKind } from "./connectionStatusKind.js"
import type { ConnectionStatusView } from "./connectionStatusView.js"

export function ConnectionStatusDetails(props: { state: ConnectionStatusView }) {
  return (
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
  )
}

import { Show } from "solid-js"
import type { PwaStatusView } from "./pwaStatusView.js"

export function PwaStatusActions(props: { state: PwaStatusView }) {
  return (
    <div class="flex items-center gap-2 max-[760px]:gap-1">
      <Show when={props.state.installable()}>
        <button
          type="button"
          class="rounded-lg border border-line px-2.5 py-[5px] text-faint text-xs hover:border-accent-border hover:text-accent max-[760px]:px-1.5"
          onClick={() => void props.state.install()}
        >
          <span class="max-[760px]:sr-only">Install app</span>
          <span class="hidden max-[760px]:inline" aria-hidden="true">
            +
          </span>
        </button>
      </Show>

      <Show when={props.state.status() === "update-ready"}>
        <button
          type="button"
          class="rounded-lg border border-accent-border px-2.5 py-[5px] text-accent text-xs"
          onClick={props.state.reloadForUpdate}
        >
          Reload to update
        </button>
      </Show>
    </div>
  )
}

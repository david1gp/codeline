import { Badge } from "@adaptive-ds/solid-ui/static/badge/Badge"
import { Show } from "solid-js"
import { pwaStatusIndicatorStateCreate } from "./pwaStatusIndicatorStateCreate.js"

export function PwaStatusIndicator() {
  const state = pwaStatusIndicatorStateCreate()

  return (
    <div class="flex items-center gap-2 max-[760px]:gap-1">
      <Show when={state.installable()}>
        <button
          type="button"
          class="rounded-lg border border-[#30342a] px-2.5 py-[5px] text-[#969b8d] text-xs hover:border-[#768d3d] hover:text-[#d8ff72] max-[760px]:px-1.5"
          onClick={() => void state.install()}
        >
          <span class="max-[760px]:sr-only">Install app</span>
          <span class="hidden max-[760px]:inline" aria-hidden="true">
            +
          </span>
        </button>
      </Show>

      <Show when={state.status() === "update-ready"}>
        <button
          type="button"
          class="rounded-lg border border-[#768d3d] px-2.5 py-[5px] text-[#d8ff72] text-xs"
          onClick={state.reloadForUpdate}
        >
          Reload to update
        </button>
      </Show>

      <Badge
        variant={state.variant()}
        class="gap-[7px] border-[#30342a] px-2.5 py-[5px] text-xs data-[state=offline]:text-[#ff8977] data-[state=online]:bg-[#1f7047] data-[state=update-ready]:text-[#e5c96b] max-[760px]:px-2 max-[760px]:data-[state=online]:sr-only"
        data-state={state.status()}
        role="status"
        aria-live="polite"
      >
        <span class="size-1.5 rounded-full bg-current shadow-[0_0_10px_currentColor]" aria-hidden="true" />
        <span class="max-[760px]:sr-only">{state.label()}</span>
      </Badge>
    </div>
  )
}

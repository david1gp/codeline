import { Badge } from "@adaptive-ds/solid-ui/static/badge/Badge"
import { zeroConnectionIndicatorStateCreate } from "./zeroConnectionIndicatorStateCreate.js"

export function ZeroConnectionIndicator() {
  const state = zeroConnectionIndicatorStateCreate()

  return (
    <Badge
      variant={state.variant()}
      class="gap-[7px] border-[#30342a] px-2.5 py-[5px] text-xs data-[state=connecting]:text-[#e5c96b] data-[state=error]:text-[#ff8977] data-[state=offline]:text-[#ff8977] data-[state=online]:bg-[#1f7047]"
      data-state={state.status()}
      role="status"
      aria-live="polite"
    >
      <span class="size-1.5 rounded-full bg-current shadow-[0_0_10px_currentColor]" aria-hidden="true" />
      {state.label()}
    </Badge>
  )
}

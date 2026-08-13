import { Badge } from "@adaptive-ds/solid-ui/static/badge/Badge"
import { zeroConnectionIndicatorStateCreate } from "./zeroConnectionIndicatorStateCreate.js"

export function ZeroConnectionIndicator() {
  const state = zeroConnectionIndicatorStateCreate()

  return (
    <Badge
      variant={state.variant()}
      class="health-badge zero-connection-badge"
      data-state={state.status()}
      role="status"
      aria-live="polite"
    >
      <span class="health-dot" aria-hidden="true" />
      {state.label()}
    </Badge>
  )
}

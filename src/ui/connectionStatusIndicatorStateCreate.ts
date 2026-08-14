import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { createMemo, onCleanup, onMount } from "solid-js"
import { connectionDisconnectedDurationFormat } from "./connectionDisconnectedDurationFormat.js"
import { connectionStatusIconResolve } from "./connectionStatusIconResolve.js"
import { connectionStatusKind } from "./connectionStatusKind.js"
import type { ConnectionStatusLine } from "./connectionStatusSummaryResolve.js"
import { connectionStatusSummaryResolve } from "./connectionStatusSummaryResolve.js"
import type { ConnectionStatusView } from "./connectionStatusView.js"

export function connectionStatusIndicatorStateCreate(input: {
  details: () => ConnectionStatusLine[]
}): ConnectionStatusView {
  const popover = createSignalObject(false)
  const now = createSignalObject(Date.now())

  onMount(() => {
    const tick = window.setInterval(() => now.set(Date.now()), 1000)
    onCleanup(() => window.clearInterval(tick))
  })

  const summary = createMemo(() => connectionStatusSummaryResolve(input.details()))
  const highlighted = createMemo(() => input.details().find((line) => line.source === summary().source)!)

  return {
    details: input.details,
    durationFor: (startedAt) => {
      const duration = connectionDisconnectedDurationFormat(startedAt, now.get())
      return duration ? `for ${duration}` : undefined
    },
    durationLabel: () => {
      const line = highlighted()
      if (line.kind !== connectionStatusKind.offline && line.kind !== connectionStatusKind.error) return undefined
      const duration = connectionDisconnectedDurationFormat(line.disconnectedSince, now.get())
      if (!duration) return undefined
      return `for ${duration}`
    },
    icon: () => connectionStatusIconResolve(summary()),
    isError: () => summary().kind === connectionStatusKind.error,
    kind: () => summary().kind,
    label: () => highlighted().label,
    popoverOpen: () => popover.get(),
    popoverOpenChange: (open) => popover.set(open),
  }
}

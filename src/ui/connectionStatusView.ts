import type { ConnectionStatusKind } from "./connectionStatusKind.js"
import type { ConnectionStatusLine } from "./connectionStatusSummaryResolve.js"

export type ConnectionStatusView = {
  details: () => ConnectionStatusLine[]
  durationFor: (startedAt: number | undefined) => string | undefined
  durationLabel: () => string | undefined
  icon: () => string
  isError: () => boolean
  kind: () => ConnectionStatusKind
  label: () => string
  popoverOpen: () => boolean
  popoverOpenChange: (open: boolean) => void
}

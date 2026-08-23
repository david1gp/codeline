import type { EventFeedConnectionView } from "./eventFeedConnectionView.js"
import { signalObjectCreate } from "./signalObjectCreate.js"
import type { UiDataLayerStatus } from "./uiDataLayerStatusSchema.js"

const eventFeedConnectionInitialStatus: UiDataLayerStatus = { accountId: null, status: "offline" }

/**
 * Shell state for the per-tab `/api/events` feed indicator. The data-layer feed
 * owner reports every `UiDataLayerStatus` through `statusSet`; until an owner is
 * wired into the shell, the feed is reported as offline.
 */
export function eventFeedConnectionIndicatorStateCreate(): EventFeedConnectionView & {
  statusSet: (status: UiDataLayerStatus) => void
} {
  const status = signalObjectCreate<UiDataLayerStatus>(eventFeedConnectionInitialStatus)
  const disconnectedSince = signalObjectCreate<number | undefined>(Date.now())

  const statusSet = (next: UiDataLayerStatus): void => {
    const previous = status.get()
    if (previous.status === next.status) return
    if (next.status === "offline") disconnectedSince.set(Date.now())
    if (previous.status === "offline") disconnectedSince.set(undefined)
    status.set(next)
  }

  return {
    disconnectedSince: () => disconnectedSince.get(),
    label: () => {
      if (status.get().status === "connected") return "Events connected"
      if (status.get().status === "reconnecting") return "Events reconnecting"
      if (status.get().status === "reconciling") return "Events reconciling"
      if (status.get().status === "stale") return "Events stale"
      return "Events offline"
    },
    status: () => status.get().status,
    statusSet,
  }
}

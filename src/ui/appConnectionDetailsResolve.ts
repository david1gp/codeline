import type { EventFeedConnectionView } from "./eventFeedConnectionView.js"
import { connectionStatusLineIconResolve } from "./connectionStatusIconResolve.js"
import { connectionStatusKind } from "./connectionStatusKind.js"
import { connectionStatusSource } from "./connectionStatusSource.js"
import type { ConnectionStatusLine } from "./connectionStatusSummaryResolve.js"
import type { PwaStatusView } from "./pwa/pwaStatusView.js"

export function appConnectionDetailsResolve(input: {
  events: EventFeedConnectionView
  healthDisconnectedSince: () => number | undefined
  healthLabel: () => string
  healthStatus: () => string
  pwa: PwaStatusView
}): ConnectionStatusLine[] {
  const appStatus = input.pwa.status()
  const eventsStatus = input.events.status()
  const healthStatus = input.healthStatus()

  const app = {
    disconnectedSince: input.pwa.disconnectedSince(),
    kind:
      appStatus === "offline"
        ? connectionStatusKind.offline
        : appStatus === "update-ready"
          ? connectionStatusKind.updateReady
          : connectionStatusKind.ok,
    label: input.pwa.label(),
    source: connectionStatusSource.app,
  }
  const events = {
    disconnectedSince: input.events.disconnectedSince(),
    kind:
      eventsStatus === "stale"
        ? connectionStatusKind.error
        : eventsStatus === "offline"
          ? connectionStatusKind.offline
          : eventsStatus === "reconnecting"
            ? connectionStatusKind.connecting
            : eventsStatus === "reconciling"
              ? connectionStatusKind.checking
              : connectionStatusKind.ok,
    label: input.events.label(),
    source: connectionStatusSource.events,
  }
  const api = {
    disconnectedSince: input.healthDisconnectedSince(),
    kind:
      healthStatus === "unavailable"
        ? connectionStatusKind.error
        : healthStatus === "checking"
          ? connectionStatusKind.checking
          : connectionStatusKind.ok,
    label: input.healthLabel(),
    source: connectionStatusSource.api,
  }

  return [
    { ...app, icon: connectionStatusLineIconResolve(app) },
    { ...events, icon: connectionStatusLineIconResolve(events) },
    { ...api, icon: connectionStatusLineIconResolve(api) },
  ]
}

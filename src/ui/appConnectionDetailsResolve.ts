import { connectionStatusLineIconResolve } from "./connectionStatusIconResolve.js"
import { connectionStatusKind } from "./connectionStatusKind.js"
import { connectionStatusSource } from "./connectionStatusSource.js"
import type { ConnectionStatusLine } from "./connectionStatusSummaryResolve.js"
import type { PwaStatusView } from "./pwa/pwaStatusView.js"
import type { ZeroConnectionView } from "./zeroConnectionView.js"

export function appConnectionDetailsResolve(input: {
  healthDisconnectedSince: () => number | undefined
  healthLabel: () => string
  healthStatus: () => string
  pwa: PwaStatusView
  zero: ZeroConnectionView
}): ConnectionStatusLine[] {
  const appStatus = input.pwa.status()
  const zeroStatus = input.zero.status()
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
  const zero = {
    disconnectedSince: input.zero.disconnectedSince(),
    kind:
      zeroStatus === "error"
        ? connectionStatusKind.error
        : zeroStatus === "offline"
          ? connectionStatusKind.offline
          : zeroStatus === "connecting"
            ? connectionStatusKind.connecting
            : connectionStatusKind.ok,
    label: input.zero.label(),
    source: connectionStatusSource.zero,
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
    { ...zero, icon: connectionStatusLineIconResolve(zero) },
    { ...api, icon: connectionStatusLineIconResolve(api) },
  ]
}

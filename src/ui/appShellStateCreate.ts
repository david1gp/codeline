import { appConnectionDetailsResolve } from "./appConnectionDetailsResolve.js"
import type { AppShellView } from "./appShellView.js"
import { appStateCreate } from "./appStateCreate.js"
import { connectionStatusIndicatorStateCreate } from "./connectionStatusIndicatorStateCreate.js"
import { pwaStatusIndicatorStateCreate } from "./pwa/pwaStatusIndicatorStateCreate.js"
import { themeSwitcherStateCreate } from "./themeSwitcherStateCreate.js"
import { zeroConnectionIndicatorStateCreate } from "./zeroConnectionIndicatorStateCreate.js"

export function appShellStateCreate(): AppShellView {
  const app = appStateCreate()
  const pwa = pwaStatusIndicatorStateCreate()
  const zero = zeroConnectionIndicatorStateCreate()

  return {
    ...app,
    connection: connectionStatusIndicatorStateCreate({
      details: () =>
        appConnectionDetailsResolve({
          healthDisconnectedSince: app.healthDisconnectedSince,
          healthLabel: app.healthLabel,
          healthStatus: app.healthStatus,
          pwa,
          zero,
        }),
    }),
    pwa,
    theme: themeSwitcherStateCreate(),
    zero,
  }
}

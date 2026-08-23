import { activeProjectStateCreate } from "./activeProjectStateCreate.js"
import { appConnectionDetailsResolve } from "./appConnectionDetailsResolve.js"
import type { AppShellView } from "./appShellView.js"
import { appStateCreate } from "./appStateCreate.js"
import { connectionStatusIndicatorStateCreate } from "./connectionStatusIndicatorStateCreate.js"
import { eventFeedConnectionIndicatorStateCreate } from "./eventFeedConnectionIndicatorStateCreate.js"
import { pwaStatusIndicatorStateCreate } from "./pwa/pwaStatusIndicatorStateCreate.js"
import { themeSwitcherStateCreate } from "./themeSwitcherStateCreate.js"

export function appShellStateCreate(): AppShellView & {
  events: ReturnType<typeof eventFeedConnectionIndicatorStateCreate>
} {
  const app = appStateCreate()
  const pwa = pwaStatusIndicatorStateCreate()
  const events = eventFeedConnectionIndicatorStateCreate()

  return {
    ...app,
    activeProject: activeProjectStateCreate(),
    connection: connectionStatusIndicatorStateCreate({
      details: () =>
        appConnectionDetailsResolve({
          events,
          healthDisconnectedSince: app.healthDisconnectedSince,
          healthLabel: app.healthLabel,
          healthStatus: app.healthStatus,
          pwa,
        }),
    }),
    events,
    pwa,
    theme: themeSwitcherStateCreate(),
  }
}

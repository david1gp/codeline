import { projectRegistryStateCreate } from "../project/ui/projectRegistryStateCreate.js"
import { activeProjectStateCreate } from "./activeProjectStateCreate.js"
import { appConnectionDetailsResolve } from "./appConnectionDetailsResolve.js"
import type { AppShellView } from "./appShellView.js"
import { appStateCreate } from "./appStateCreate.js"
import { connectionStatusIndicatorStateCreate } from "./connectionStatusIndicatorStateCreate.js"
import { eventFeedConnectionIndicatorStateCreate } from "./eventFeedConnectionIndicatorStateCreate.js"
import { pwaStatusIndicatorStateCreate } from "./pwa/pwaStatusIndicatorStateCreate.js"
import { themeSwitcherStateCreate } from "./themeSwitcherStateCreate.js"

type AppShellStateOptions = {
  accountId?: () => string | null
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

export function appShellStateCreate(options: AppShellStateOptions = {}): AppShellView & {
  events: ReturnType<typeof eventFeedConnectionIndicatorStateCreate>
} {
  const app = appStateCreate()
  const pwa = pwaStatusIndicatorStateCreate()
  const events = eventFeedConnectionIndicatorStateCreate()
  const projectRegistry = projectRegistryStateCreate({
    accountId: options.accountId,
    fetch: options.fetch,
  })

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
    projectRegistry,
    pwa,
    theme: themeSwitcherStateCreate(),
  }
}

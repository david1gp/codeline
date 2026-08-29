import type { ProjectRegistryState } from "../project/ui/projectRegistryStateCreate.js"
import type { ActiveProjectState } from "./activeProjectStateCreate.js"
import type { ConnectionStatusView } from "./connectionStatusView.js"
import type { EventFeedConnectionView } from "./eventFeedConnectionView.js"
import type { PwaStatusView } from "./pwa/pwaStatusView.js"
import type { ThemeSwitcherView } from "./themeSwitcherView.js"

/**
 * Rendering contract of the application shell header, so production API/event
 * feed state and demo fixtures can supply the same shape without the view
 * knowing the source.
 */
export type AppShellView = {
  activeProject: ActiveProjectState
  connection: ConnectionStatusView
  healthDisconnectedSince: () => number | undefined
  healthLabel: () => string
  healthStatus: () => string
  projectRegistry?: ProjectRegistryState
  pwa: PwaStatusView
  theme: ThemeSwitcherView
  events: EventFeedConnectionView
}

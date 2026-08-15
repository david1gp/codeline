import type { ConnectionStatusView } from "./connectionStatusView.js"
import type { PwaStatusView } from "./pwa/pwaStatusView.js"
import type { ThemeSwitcherView } from "./themeSwitcherView.js"
import type { ZeroConnectionView } from "./zeroConnectionView.js"
import type { ActiveProjectState } from "./activeProjectStateCreate.js"

/**
 * Rendering contract of the application shell header, so production API/Zero
 * state and demo fixtures can supply the same shape without the view knowing
 * the source.
 */
export type AppShellView = {
  activeProject: ActiveProjectState
  connection: ConnectionStatusView
  healthDisconnectedSince: () => number | undefined
  healthLabel: () => string
  healthStatus: () => string
  pwa: PwaStatusView
  theme: ThemeSwitcherView
  zero: ZeroConnectionView
}

import { activeProjectStateCreate } from "../activeProjectStateCreate.js"
import { appConnectionDetailsResolve } from "../appConnectionDetailsResolve.js"
import type { AppShellView } from "../appShellView.js"
import { connectionStatusIndicatorStateCreate } from "../connectionStatusIndicatorStateCreate.js"
import type { EventFeedConnectionView } from "../eventFeedConnectionView.js"
import type { DemoSessionScreenVariant } from "./demoSessionScreenVariant.js"
import { demoThemeSwitcherStateCreate } from "./demoThemeSwitcherStateCreate.js"

/** Supplies deterministic header status without API, event feed, or service workers. */
export function demoAppShellStateCreate(variant: () => DemoSessionScreenVariant): AppShellView {
  const isHealthy = () => variant() === "ready" || variant() === "streaming"
  const disconnectedSince = () => (variant() === "error" || variant() === "empty" ? Date.now() - 65_000 : undefined)

  const pwa = {
    disconnectedSince: () => (variant() === "error" ? disconnectedSince() : undefined),
    install: () => Promise.resolve(),
    installable: () => variant() === "editing",
    label: () => {
      if (variant() === "error") return "App offline"
      if (variant() === "streaming") return "App update ready"
      return "App online"
    },
    reloadForUpdate: () => undefined,
    status: () => {
      if (variant() === "error") return "offline" as const
      if (variant() === "streaming") return "update-ready" as const
      return "online" as const
    },
  }

  const events: EventFeedConnectionView = {
    disconnectedSince: () => (variant() === "empty" || variant() === "error" ? disconnectedSince() : undefined),
    label: () => {
      if (variant() === "loading") return "Events reconciling"
      if (variant() === "empty") return "Events offline"
      if (variant() === "error") return "Events stale"
      return "Events connected"
    },
    status: () => {
      if (variant() === "loading") return "reconciling" as const
      if (variant() === "empty") return "offline" as const
      if (variant() === "error") return "stale" as const
      return "connected" as const
    },
  }

  const healthLabel = () => {
    if (isHealthy()) return "API connected"
    if (variant() === "loading") return "Checking API"
    return "API unavailable"
  }
  const healthStatus = () => {
    if (isHealthy()) return "connected"
    if (variant() === "loading") return "checking"
    return "unavailable"
  }
  const healthDisconnectedSince = () => (healthStatus() === "unavailable" ? disconnectedSince() : undefined)

  return {
    activeProject: activeProjectStateCreate(),
    connection: connectionStatusIndicatorStateCreate({
      details: () =>
        appConnectionDetailsResolve({
          events,
          healthDisconnectedSince,
          healthLabel,
          healthStatus,
          pwa,
        }),
    }),
    events,
    healthDisconnectedSince,
    healthLabel,
    healthStatus,
    pwa,
    theme: demoThemeSwitcherStateCreate(),
  }
}

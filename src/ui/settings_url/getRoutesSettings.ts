import { lazy } from "solid-js"
import type { RouteComponent, RouteConfig } from "../routeConfig.js"
import { pageNameSettings, type PageNameSettings } from "./pageNameSettings.js"
import { pageRouteSettings } from "./pageRouteSettings.js"

const SettingsRoutePage = lazy(() =>
  import("../SettingsRoutePage.js").then((module) => ({
    default: module.SettingsRoutePage,
  })),
)

export function getRoutesSettings(): RouteConfig {
  const routeMapping = {
    [pageNameSettings.settings]: SettingsRoutePage,
  } as const satisfies Record<PageNameSettings, RouteComponent>

  return Object.entries(routeMapping).map(([routeKey, component]) => ({
    path: pageRouteSettings[routeKey as PageNameSettings],
    component,
  }))
}

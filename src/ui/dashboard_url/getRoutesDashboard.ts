import { lazy } from "solid-js"
import type { RouteComponent, RouteConfig } from "../routeConfig.js"
import { pageNameDashboard, type PageNameDashboard } from "./pageNameDashboard.js"
import { pageRouteDashboard } from "./pageRouteDashboard.js"

const DashboardRoutePage = lazy(() =>
  import("../DashboardRoutePage.js").then((c) => ({
    default: c.DashboardRoutePage,
  })),
)

export function getRoutesDashboard(): RouteConfig {
  const routeMapping = {
    [pageNameDashboard.dashboard]: DashboardRoutePage,
  } as const satisfies Record<PageNameDashboard, RouteComponent>

  return Object.entries(routeMapping).map(([routeKey, component]) => ({
    path: pageRouteDashboard[routeKey as PageNameDashboard],
    component,
  }))
}

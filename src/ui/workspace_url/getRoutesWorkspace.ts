import { lazy } from "solid-js"
import type { RouteComponent, RouteConfig } from "../routeConfig.js"
import { pageNameWorkspace, type PageNameWorkspace } from "./pageNameWorkspace.js"
import { pageRouteWorkspace } from "./pageRouteWorkspace.js"

const WorkspaceRoutePage = lazy(() =>
  import("../WorkspaceRoutePage.js").then((module) => ({ default: module.WorkspaceRoutePage })),
)

export function getRoutesWorkspace(): RouteConfig {
  const routeMapping = {
    [pageNameWorkspace.sessions]: WorkspaceRoutePage,
    [pageNameWorkspace.sessionsNew]: WorkspaceRoutePage,
    [pageNameWorkspace.sessionDetail]: WorkspaceRoutePage,
  } as const satisfies Record<PageNameWorkspace, RouteComponent>

  return Object.entries(routeMapping).map(([routeKey, component]) => ({
    path: pageRouteWorkspace[routeKey as PageNameWorkspace],
    component,
  }))
}

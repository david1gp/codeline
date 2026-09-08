import { lazy } from "solid-js"
import type { RouteConfig } from "../routeConfig.js"
import { pageNameWorkspace, type PageNameWorkspace } from "./pageNameWorkspace.js"
import { pageRouteWorkspace } from "./pageRouteWorkspace.js"

const WorkspaceRoutePage = lazy(() =>
  import("../WorkspaceRoutePage.js").then((module) => ({ default: module.WorkspaceRoutePage })),
)

export function getRoutesWorkspace(): RouteConfig {
  const routeMapping = {
    [pageNameWorkspace.sessions]: pageRouteWorkspace.sessions,
    [pageNameWorkspace.sessionsNew]: pageRouteWorkspace.sessionsNew,
    [pageNameWorkspace.sessionDetail]: pageRouteWorkspace.sessionDetail,
  } as const satisfies Record<PageNameWorkspace, string>

  return [
    {
      path: Object.values(routeMapping),
      component: WorkspaceRoutePage,
    },
  ]
}

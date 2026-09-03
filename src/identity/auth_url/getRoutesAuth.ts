import { lazy } from "solid-js"
import type { RouteComponent, RouteConfig } from "../../ui/routeConfig.js"
import { pageNameAuth, type PageNameAuth } from "./pageNameAuth.js"
import { pageRouteAuth } from "./pageRouteAuth.js"

const LoginPage = lazy(() =>
  import("../ui/LoginPage.js").then((c) => ({
    default: c.LoginPage,
  })),
)

export function getRoutesAuth(): RouteConfig {
  const routeMapping = {
    [pageNameAuth.login]: LoginPage,
  } as const satisfies Record<PageNameAuth, RouteComponent>

  return Object.entries(routeMapping).map(([routeKey, component]) => ({
    path: pageRouteAuth[routeKey as PageNameAuth],
    component,
  }))
}

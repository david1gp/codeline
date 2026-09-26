import { lazy } from "solid-js"
import type { RouteComponent, RouteConfig } from "../routeConfig.js"
import { pageNameDemo, type PageNameDemo } from "./pageNameDemo.js"
import { pageRouteDemo } from "./pageRouteDemo.js"

const DemoApp = lazy(() =>
  import("../demo/DemoApp.js").then((c) => ({
    default: c.DemoApp,
  })),
)

export function getRoutesDemo(): RouteConfig {
  const routeMapping = {
    [pageNameDemo.demo]: DemoApp,
    [pageNameDemo.demoUnknown]: DemoApp,
  } as const satisfies Record<PageNameDemo, RouteComponent>

  return Object.entries(routeMapping).map(([routeKey, component]) => ({
    path: pageRouteDemo[routeKey as PageNameDemo],
    component,
  }))
}

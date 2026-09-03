import { lazy } from "solid-js"
import type { RouteComponent, RouteConfig } from "../routeConfig.js"
import { pageNameSimulate, type PageNameSimulate } from "./pageNameSimulate.js"
import { pageRouteSimulate } from "./pageRouteSimulate.js"

const SimulateApp = lazy(() =>
  import("../simulate/SimulateApp.js").then((c) => ({
    default: c.SimulateApp,
  })),
)

export function getRoutesSimulate(): RouteConfig {
  const routeMapping = {
    [pageNameSimulate.simulate]: SimulateApp,
    [pageNameSimulate.simulateUnknown]: SimulateApp,
  } as const satisfies Record<PageNameSimulate, RouteComponent>

  return Object.entries(routeMapping).map(([routeKey, component]) => ({
    path: pageRouteSimulate[routeKey as PageNameSimulate],
    component,
  }))
}

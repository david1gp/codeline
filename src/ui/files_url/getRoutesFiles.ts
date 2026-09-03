import { lazy } from "solid-js"
import type { RouteComponent, RouteConfig } from "../routeConfig.js"
import { pageNameFiles, type PageNameFiles } from "./pageNameFiles.js"
import { pageRouteFiles } from "./pageRouteFiles.js"

const FilesRoutePage = lazy(() =>
  import("../FilesRoutePage.js").then((c) => ({
    default: c.FilesRoutePage,
  })),
)

export function getRoutesFiles(): RouteConfig {
  const routeMapping = {
    [pageNameFiles.files]: FilesRoutePage,
  } as const satisfies Record<PageNameFiles, RouteComponent>

  return Object.entries(routeMapping).map(([routeKey, component]) => ({
    path: pageRouteFiles[routeKey as PageNameFiles],
    component,
  }))
}

import { simulationScenarioSessionMetadata } from "../simulation/simulationScenarioSessionMetadata.js"
import { demoCatalogRouteResolve } from "../ui/demo/demoCatalogRouteResolve.js"
import { demoScenarioRegistry } from "../ui/demo/demoScenarioRegistry.js"

const applicationRoutePaths = ["/", "/files", "/notes", "/notes/new"] as const
const demoSectionPaths = ["/demo/components", "/demo/screens"] as const

export function appKnownRouteResolve(pathname: string): boolean {
  const normalizedPathname = pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname

  if (applicationRoutePaths.includes(normalizedPathname as (typeof applicationRoutePaths)[number])) return true

  if (normalizedPathname.startsWith("/notes/")) {
    const noteId = normalizedPathname.slice("/notes/".length)
    return noteId !== "" && !noteId.includes("/")
  }

  if (normalizedPathname === "/simulate") return true

  if (Object.values(simulationScenarioSessionMetadata).some((scenario) => scenario.href === normalizedPathname))
    return true

  if (
    normalizedPathname === "/demo" ||
    demoSectionPaths.includes(normalizedPathname as (typeof demoSectionPaths)[number])
  ) {
    return true
  }

  if (
    demoScenarioRegistry.some(
      (scenario) => scenario.href === normalizedPathname || `/demo/${scenario.slug}` === normalizedPathname,
    )
  ) {
    return true
  }

  // Nested catalog URLs such as /demo/screens/workspace-screen must load directly.
  if (!normalizedPathname.startsWith("/demo/")) return false
  return demoCatalogRouteResolve(normalizedPathname).kind !== "index"
}

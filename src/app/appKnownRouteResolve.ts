import { demoScenarioRegistry } from "../ui/demo/demoScenarioRegistry.js"
import { simulateScenarioHref } from "../ui/simulate/simulateScenarioHref.js"
import { simulateScenarioRegistry } from "../ui/simulate/simulateScenarioRegistry.js"

const applicationRoutePaths = ["/", "/files", "/notes", "/notes/new"] as const

export function appKnownRouteResolve(pathname: string): boolean {
  const normalizedPathname = pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname

  if (applicationRoutePaths.includes(normalizedPathname as (typeof applicationRoutePaths)[number])) return true

  if (normalizedPathname.startsWith("/notes/")) {
    const noteId = normalizedPathname.slice("/notes/".length)
    return noteId !== "" && !noteId.includes("/")
  }

  if (normalizedPathname === "/simulate") return true

  if (simulateScenarioRegistry.some((scenario) => simulateScenarioHref(scenario.slug) === normalizedPathname))
    return true

  return demoScenarioRegistry.some((scenario) => scenario.href === normalizedPathname)
}

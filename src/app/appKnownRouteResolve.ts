import { demoScenarioRegistry } from "../ui/demo/demoScenarioRegistry.js"

const applicationRoutePaths = ["/", "/files", "/notes", "/notes/new"] as const

export function appKnownRouteResolve(pathname: string): boolean {
  const normalizedPathname = pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname

  if (applicationRoutePaths.includes(normalizedPathname as (typeof applicationRoutePaths)[number])) return true

  if (normalizedPathname.startsWith("/notes/")) {
    const noteId = normalizedPathname.slice("/notes/".length)
    return noteId !== "" && !noteId.includes("/")
  }

  return demoScenarioRegistry.some((scenario) => scenario.href === normalizedPathname)
}

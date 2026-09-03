import { pageRouteAuth } from "../identity/auth_url/pageRouteAuth.js"
import { pageRouteNote } from "../note/note_url/pageRouteNote.js"
import { simulationScenarioSessionMetadata } from "../simulation/simulationScenarioSessionMetadata.js"
import { pageRouteDashboard } from "../ui/dashboard_url/pageRouteDashboard.js"
import { demoCatalogRouteResolve } from "../ui/demo/demoCatalogRouteResolve.js"
import { demoScenarioRegistry } from "../ui/demo/demoScenarioRegistry.js"
import { pageRouteDemo } from "../ui/demo_url/pageRouteDemo.js"
import { urlDemoSection, urlDemoUnknown } from "../ui/demo_url/urlDemo.js"
import { pageRouteFiles } from "../ui/files_url/pageRouteFiles.js"
import { sessionRouteResolve } from "../ui/sessionRouteResolve.js"
import { pageRouteSettings } from "../ui/settings_url/pageRouteSettings.js"
import { pageRouteSimulate } from "../ui/simulate_url/pageRouteSimulate.js"
import { pageRouteWorkspace } from "../ui/workspace_url/pageRouteWorkspace.js"

const applicationRoutePaths = [
  pageRouteDashboard.dashboard,
  pageRouteFiles.files,
  pageRouteAuth.login,
  pageRouteNote.notes,
  pageRouteNote.noteNew,
  pageRouteWorkspace.sessions,
  pageRouteSettings.settings,
] as const
const demoSectionPaths = [urlDemoSection("components"), urlDemoSection("screens")] as const
const noteViewPrefix = pageRouteNote.noteView.replace(":noteId", "")
const demoPathPrefix = `${pageRouteDemo.demo}/`

export function appKnownRouteResolve(pathname: string): boolean {
  const normalizedPathname =
    pathname.endsWith("/") && pathname !== pageRouteDashboard.dashboard ? pathname.slice(0, -1) : pathname

  if (applicationRoutePaths.includes(normalizedPathname as (typeof applicationRoutePaths)[number])) return true

  if (normalizedPathname.startsWith(`${pageRouteWorkspace.sessions}/`)) {
    return sessionRouteResolve(new URL(normalizedPathname, "https://codeline.local")).kind !== "invalid"
  }

  if (normalizedPathname.startsWith(noteViewPrefix)) {
    const noteId = normalizedPathname.slice(noteViewPrefix.length)
    return noteId !== "" && !noteId.includes("/")
  }

  if (normalizedPathname === pageRouteSimulate.simulate) return true

  if (Object.values(simulationScenarioSessionMetadata).some((scenario) => scenario.href === normalizedPathname))
    return true

  if (
    normalizedPathname === pageRouteDemo.demo ||
    demoSectionPaths.includes(normalizedPathname as (typeof demoSectionPaths)[number])
  ) {
    return true
  }

  if (
    demoScenarioRegistry.some(
      (scenario) => scenario.href === normalizedPathname || urlDemoUnknown(scenario.slug) === normalizedPathname,
    )
  ) {
    return true
  }

  // Nested catalog URLs such as /demo/screens/workspace-screen must load directly.
  if (!normalizedPathname.startsWith(demoPathPrefix)) return false
  return demoCatalogRouteResolve(normalizedPathname).kind !== "index"
}

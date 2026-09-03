import { expect, mock, test } from "bun:test"
import * as solidRuntime from "solid-js/dist/solid.js"
import { pageNameAuth } from "../src/identity/auth_url/pageNameAuth.js"
import { pageRouteAuth } from "../src/identity/auth_url/pageRouteAuth.js"
import { urlAuthLogin } from "../src/identity/auth_url/urlAuth.js"
import { pageNameNote } from "../src/note/note_url/pageNameNote.js"
import { pageRouteNote } from "../src/note/note_url/pageRouteNote.js"
import { urlNoteView, urlNoteNew, urlNotes } from "../src/note/note_url/urlNote.js"
import { pageNameDashboard } from "../src/ui/dashboard_url/pageNameDashboard.js"
import { pageRouteDashboard } from "../src/ui/dashboard_url/pageRouteDashboard.js"
import { urlDashboard } from "../src/ui/dashboard_url/urlDashboard.js"
import { pageNameDemo } from "../src/ui/demo_url/pageNameDemo.js"
import { pageRouteDemo } from "../src/ui/demo_url/pageRouteDemo.js"
import { urlDemo, urlDemoItem, urlDemoSection, urlDemoUnknown } from "../src/ui/demo_url/urlDemo.js"
import { pageNameFiles } from "../src/ui/files_url/pageNameFiles.js"
import { pageRouteFiles } from "../src/ui/files_url/pageRouteFiles.js"
import { urlFiles } from "../src/ui/files_url/urlFiles.js"
import { pageNameSettings } from "../src/ui/settings_url/pageNameSettings.js"
import { pageRouteSettings } from "../src/ui/settings_url/pageRouteSettings.js"
import { urlSettings } from "../src/ui/settings_url/urlSettings.js"
import { pageNameSimulate } from "../src/ui/simulate_url/pageNameSimulate.js"
import { pageRouteSimulate } from "../src/ui/simulate_url/pageRouteSimulate.js"
import { urlSimulate, urlSimulateScenario, urlSimulateUnknown } from "../src/ui/simulate_url/urlSimulate.js"
import { pageNameWorkspace } from "../src/ui/workspace_url/pageNameWorkspace.js"
import { pageRouteWorkspace } from "../src/ui/workspace_url/pageRouteWorkspace.js"
import { urlWorkspace } from "../src/ui/workspace_url/urlWorkspace.js"
import type { RouteComponent, RouteConfig } from "../src/ui/routeConfig.js"

mock.module("solid-js", () => solidRuntime)
// Route pages import browser-only router/UI packages. Keep their boundaries mocked so these
// checks exercise each lazy import callback without evaluating server-only APIs in Bun.
mock.module("@solidjs/router", () => ({
  A: () => null,
  useLocation: () => ({ query: {} }),
  useNavigate: () => () => undefined,
  useParams: () => ({}),
  useSearchParams: () => [{}, () => undefined],
}))
mock.module("@tanstack/solid-router", () => ({ createLink: (component: unknown) => component }))
mock.module("@corvu/popover", () => ({ default: () => null }))
const { getRoutesAuth } = await import("../src/identity/auth_url/getRoutesAuth.js")
const { getRoutesDashboard } = await import("../src/ui/dashboard_url/getRoutesDashboard.js")
const { getRoutesDemo } = await import("../src/ui/demo_url/getRoutesDemo.js")
const { getRoutesFiles } = await import("../src/ui/files_url/getRoutesFiles.js")
const { getRoutesNote } = await import("../src/note/note_url/getRoutesNote.js")
const { getRoutesSettings } = await import("../src/ui/settings_url/getRoutesSettings.js")
const { getRoutesSimulate } = await import("../src/ui/simulate_url/getRoutesSimulate.js")
const { getRoutesWorkspace } = await import("../src/ui/workspace_url/getRoutesWorkspace.js")

function routeGroupCreate(names: object, paths: object, getRoutes: () => RouteConfig, count: number) {
  return { count, getRoutes, names, paths }
}

test("route groups preserve page-name mappings, path order, and route counts", () => {
  const routeGroups = [
    routeGroupCreate(pageNameAuth, pageRouteAuth, getRoutesAuth, 1),
    routeGroupCreate(pageNameDashboard, pageRouteDashboard, getRoutesDashboard, 1),
    routeGroupCreate(pageNameDemo, pageRouteDemo, getRoutesDemo, 2),
    routeGroupCreate(pageNameFiles, pageRouteFiles, getRoutesFiles, 1),
    routeGroupCreate(pageNameNote, pageRouteNote, getRoutesNote, 3),
    routeGroupCreate(pageNameSettings, pageRouteSettings, getRoutesSettings, 1),
    routeGroupCreate(pageNameSimulate, pageRouteSimulate, getRoutesSimulate, 2),
    routeGroupCreate(pageNameWorkspace, pageRouteWorkspace, getRoutesWorkspace, 3),
  ]

  for (const group of routeGroups) {
    expect(Object.keys(group.names)).toEqual(Object.keys(group.paths))
    const routes = group.getRoutes()
    expect(routes).toHaveLength(group.count)
    expect(routes.map((route) => route.path)).toEqual(Object.values(group.paths))
  }
})

test("route groups expose lazy components for every registered route", () => {
  const routes = [
    ...getRoutesAuth(),
    ...getRoutesDashboard(),
    ...getRoutesDemo(),
    ...getRoutesFiles(),
    ...getRoutesNote(),
    ...getRoutesSettings(),
    ...getRoutesSimulate(),
    ...getRoutesWorkspace(),
  ]

  for (const route of routes) {
    expect(typeof route.component).toBe("function")
    expect(typeof (route.component as { preload?: unknown }).preload).toBe("function")
  }
})

test("every route resolves its lazy component through preload", async () => {
  const routeGroups = [
    ["auth", getRoutesAuth()],
    ["dashboard", getRoutesDashboard()],
    ["demo", getRoutesDemo()],
    ["files", getRoutesFiles()],
    ["note", getRoutesNote()],
    ["settings", getRoutesSettings()],
    ["simulate", getRoutesSimulate()],
    ["workspace", getRoutesWorkspace()],
  ] as const

  for (const [group, routes] of routeGroups) {
    for (const route of routes) {
      const component = route.component as RouteComponent & {
        preload: () => Promise<{ default: unknown }>
      }
      const loaded = await component.preload()

      expect(typeof loaded.default, `${group} ${route.path}`).toBe("function")
    }
  }
})

test("application route groups keep wildcard fallbacks after their concrete routes", () => {
  expect(getRoutesDemo().map((route) => route.path)).toEqual(["/demo", "/demo/*unknownDemo"])
  expect(getRoutesSimulate().map((route) => route.path)).toEqual(["/simulate", "/simulate/*unknownSimulation"])
  expect(getRoutesNote().map((route) => route.path)).toEqual(["/notes", "/notes/new", "/notes/:noteId"])
  expect(getRoutesWorkspace().map((route) => route.path)).toEqual([
    "/sessions",
    "/sessions/new",
    "/sessions/:sessionId",
  ])
  expect(getRoutesDemo()[0]?.component).toBe(getRoutesDemo()[1]?.component)
  expect(getRoutesSimulate()[0]?.component).toBe(getRoutesSimulate()[1]?.component)
})

test("route builders preserve URLs and encode dynamic parameters", () => {
  const returnTo = "/sessions/session id?tab=projects&filter=a/b"
  expect(urlAuthLogin(returnTo)).toBe(`/login?returnTo=${encodeURIComponent(returnTo)}`)
  expect(urlAuthLogin()).toBe("/login")

  expect(urlDashboard()).toBe("/")
  expect(urlFiles()).toBe("/explorer")
  expect(urlSettings()).toBe("/settings")
  expect(urlNotes()).toBe("/notes")
  expect(urlNoteNew()).toBe("/notes/new")
  expect(urlNoteView("note/id?")).toBe("/notes/note%2Fid%3F")

  expect(urlDemo()).toBe("/demo")
  expect(urlDemoSection("section one")).toBe("/demo/section%20one")
  expect(urlDemoItem("section one", "item/2?")).toBe("/demo/section%20one/item%2F2%3F")
  expect(urlDemoUnknown("section/item with?")).toBe("/demo/section/item%20with%3F")
  expect(urlDemoUnknown("")).toBe("/demo")

  expect(urlSimulate()).toBe("/simulate")
  expect(urlSimulateScenario("scenario one/2")).toBe("/simulate/scenario%20one%2F2")
  expect(urlSimulateUnknown("group/scenario with?")).toBe("/simulate/group/scenario%20with%3F")
  expect(urlSimulateUnknown("")).toBe("/simulate")

  expect(urlWorkspace.sessions()).toBe("/sessions")
  expect(urlWorkspace.sessions({ tab: "pinned" })).toBe("/sessions?tab=pinned")
  expect(urlWorkspace.sessionsNew({ tab: "projects" })).toBe("/sessions/new?tab=projects")
  expect(urlWorkspace.sessionDetail("session/id?", { tab: "search" })).toBe("/sessions/session%2Fid%3F?tab=search")
})

test("UiRouter composes application and top-level route groups in their intended nesting", async () => {
  const source = await Bun.file(new URL("../src/ui/UiRouter.tsx", import.meta.url)).text()
  const applicationRouteEnd = source.indexOf("</Route>")

  expect(applicationRouteEnd).toBeGreaterThan(-1)
  for (const routeGroup of [
    "getRoutesDashboard",
    "getRoutesWorkspace",
    "getRoutesFiles",
    "getRoutesNote",
    "getRoutesSettings",
    "getRoutesSimulate",
  ]) {
    expect(source.indexOf(routeGroup)).toBeLessThan(applicationRouteEnd)
  }
  for (const routeGroup of ["getRoutesAuth", "getRoutesDemo"]) {
    expect(source.indexOf(routeGroup, applicationRouteEnd)).toBeGreaterThan(applicationRouteEnd)
  }
  expect(source).toContain('<Route path="/" component={ApplicationRoot}>')
})

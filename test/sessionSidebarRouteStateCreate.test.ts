import { expect, test } from "bun:test"
import { createRoot } from "solid-js/dist/solid.js"
import { sessionSidebarRouteStateCreate } from "../src/ui/sessionSidebarRouteStateCreate.js"
import { signalObjectCreate } from "../src/ui/signalObjectCreate.js"

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

function storageCreate(initialTab?: string) {
  const values = new Map<string, string>()
  if (initialTab !== undefined) values.set("codeline.sessionSidebarTab", initialTab)

  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    value: () => values.get("codeline.sessionSidebarTab"),
  }
}

function routeCreate(initialHref: string, initialStoredTab?: string) {
  const href = signalObjectCreate(initialHref)
  const navigations: Array<{ href: string; replace: boolean }> = []
  const storage = storageCreate(initialStoredTab)
  const navigate = (nextHref: string, options?: { replace?: boolean }) => {
    const absoluteHref = new URL(nextHref, href.get()).href
    navigations.push({ href: absoluteHref, replace: options?.replace === true })
    href.set(absoluteHref)
  }

  return {
    href: href.get,
    navigate,
    navigations,
    storage,
    visit: (nextHref: string) => href.set(new URL(nextHref, href.get()).href),
  }
}

test("session sidebar routes normalize base and invalid paths with validated storage", async () => {
  const restoredRoute = routeCreate("https://codeline.test/sessions?session=selected#chat", "watched")
  const restoredRoot = createRoot((dispose) => ({
    dispose,
    state: sessionSidebarRouteStateCreate(restoredRoute),
  }))

  await tick()
  expect(restoredRoot.state.activeTab()).toBe("watched")
  expect(restoredRoute.navigations).toEqual([
    { href: "https://codeline.test/sessions/selected?tab=watched#chat", replace: true },
  ])
  expect(restoredRoute.storage.value()).toBe("watched")
  restoredRoot.dispose()

  const invalidRoute = routeCreate("https://codeline.test/sessions/not-a-tab/extra?search=term", "not-a-tab")
  const invalidRoot = createRoot((dispose) => ({
    dispose,
    state: sessionSidebarRouteStateCreate(invalidRoute),
  }))

  await tick()
  expect(invalidRoot.state.activeTab()).toBe("recent")
  expect(invalidRoute.navigations).toEqual([{ href: "https://codeline.test/sessions?tab=recent", replace: true }])
  expect(invalidRoute.storage.value()).toBe("recent")
  invalidRoot.dispose()
})

test("session sidebar tab selection changes paths and preserves query and hash state", async () => {
  const route = routeCreate("https://codeline.test/sessions/recent?session=selected&search=term#chat")
  const root = createRoot((dispose) => ({ dispose, state: sessionSidebarRouteStateCreate(route) }))

  await tick()
  root.state.selectTab("projects")
  expect(root.state.activeTab()).toBe("projects")
  expect(route.navigations.at(-1)).toEqual({
    href: "https://codeline.test/sessions/selected?tab=projects#chat",
    replace: false,
  })
  expect(route.storage.value()).toBe("projects")

  route.visit("/sessions/search/?session=selected&search=next")
  await tick()
  expect(root.state.activeTab()).toBe("search")
  expect(route.navigations.at(-1)).toEqual({
    href: "https://codeline.test/sessions/selected?tab=search&search=next",
    replace: true,
  })
  expect(route.storage.value()).toBe("search")
  root.dispose()
})

test("session sidebar removes search state from non-search routes during normalization", async () => {
  const route = routeCreate("https://codeline.test/sessions/recent?session=selected&search=term#chat")
  const root = createRoot((dispose) => ({ dispose, state: sessionSidebarRouteStateCreate(route) }))

  await tick()
  expect(route.navigations).toEqual([
    { href: "https://codeline.test/sessions/selected?tab=recent#chat", replace: true },
  ])
  root.dispose()
})

test("session sidebar redirects legacy tabs to canonical selected-session URLs", async () => {
  const route = routeCreate("https://codeline.test/sessions/projects?session=selected&tab=watched&search=term#chat")
  const root = createRoot((dispose) => ({ dispose, state: sessionSidebarRouteStateCreate(route) }))

  await tick()
  expect(route.navigations).toEqual([
    { href: "https://codeline.test/sessions/selected?tab=watched#chat", replace: true },
  ])
  root.dispose()
})

test("session sidebar keeps unknown canonical session IDs and reserves new-session paths", async () => {
  const unknownRoute = routeCreate("https://codeline.test/sessions/unknown-id?tab=recent")
  const unknownRoot = createRoot((dispose) => ({ dispose, state: sessionSidebarRouteStateCreate(unknownRoute) }))

  await tick()
  expect(unknownRoute.navigations).toEqual([])
  unknownRoot.dispose()

  const newRoute = routeCreate("https://codeline.test/sessions/new?tab=recent")
  const newRoot = createRoot((dispose) => ({ dispose, state: sessionSidebarRouteStateCreate(newRoute) }))

  await tick()
  newRoot.state.selectTab("projects")
  expect(newRoute.navigations.at(-1)).toEqual({
    href: "https://codeline.test/sessions/new?tab=projects",
    replace: false,
  })
  newRoot.dispose()
})

test("session sidebar restores the last valid route choice across reloads", async () => {
  const firstRoute = routeCreate("https://codeline.test/sessions/projects")
  const firstRoot = createRoot((dispose) => ({ dispose, state: sessionSidebarRouteStateCreate(firstRoute) }))
  await tick()
  expect(firstRoute.storage.value()).toBe("projects")
  firstRoot.dispose()

  const reloadedRoute = routeCreate("https://codeline.test/sessions", firstRoute.storage.value())
  const reloadedRoot = createRoot((dispose) => ({
    dispose,
    state: sessionSidebarRouteStateCreate(reloadedRoute),
  }))
  await tick()
  expect(reloadedRoot.state.activeTab()).toBe("projects")
  expect(reloadedRoute.navigations.at(-1)?.href).toBe("https://codeline.test/sessions?tab=projects")
  reloadedRoot.dispose()
})

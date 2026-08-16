import { expect, test } from "bun:test"
import { appRouteResolve } from "../src/ui/appRouteResolve.js"

test("app routes the project files surface without changing workspace fallbacks", () => {
  expect(appRouteResolve("/files")).toBe("files")
  expect(appRouteResolve("/sessions")).toBe("workspace")
  expect(appRouteResolve("/sessions/recent")).toBe("workspace")
  expect(appRouteResolve("/sessions/search")).toBe("workspace")
  expect(appRouteResolve("/settings")).toBe("settings")
  expect(appRouteResolve("/notes")).toBe("notes")
  expect(appRouteResolve("/notes/new")).toBe("notes-new")
  expect(appRouteResolve("/notes/note-1")).toBe("note")
  expect(appRouteResolve("/notes/")).toBe("workspace")
  expect(appRouteResolve("/")).toBe("workspace")
  expect(appRouteResolve("/unknown")).toBe("workspace")
})

test("primary navigation exposes sessions, explorer, notes, and settings", async () => {
  const source = await Bun.file(new URL("../src/ui/primaryNavigationStateCreate.ts", import.meta.url)).text()

  expect(source).toContain("Sessions")
  expect(source).toContain("Explorer")
  expect(source).toContain("Notes")
  expect(source).toContain('href: () => "/settings"')
  expect(source).toContain("mdiCogOutline")
  expect(source).toContain("Settings")
})

test("settings is registered with the settings route page", async () => {
  const routerSource = await Bun.file(new URL("../src/ui/UiRouter.tsx", import.meta.url)).text()
  const settingsSource = await Bun.file(new URL("../src/ui/SettingsRoutePage.tsx", import.meta.url)).text()

  expect(routerSource).toContain('import { SettingsRoutePage } from "./SettingsRoutePage.js"')
  expect(routerSource).toContain('<Route path="/settings" component={SettingsRoutePage} />')
  expect(settingsSource).toContain('<h1 id="settings-title"')
  expect(settingsSource).toContain("Settings")
})

test("the workspace is registered on the session sidebar routes instead of root", async () => {
  const routerSource = await Bun.file(new URL("../src/ui/UiRouter.tsx", import.meta.url)).text()

  expect(routerSource).toContain('path={["/sessions", "/sessions/:sidebarTab"]}')
  expect(routerSource).not.toContain('<Route path="/" component={WorkspaceRoutePage} />')
})

test("primary navigation reuses the shell-owned mobile session drawer", async () => {
  const navigationSource = await Bun.file(new URL("../src/ui/primaryNavigationStateCreate.ts", import.meta.url)).text()

  expect(navigationSource).toContain("useContext(sessionDrawerContext)")
})

test("PWA installation is Settings-only while update reload remains in the shell", async () => {
  const appSource = await Bun.file(new URL("../src/ui/App.tsx", import.meta.url)).text()
  const settingsSource = await Bun.file(new URL("../src/ui/SettingsRoutePage.tsx", import.meta.url)).text()
  const pwaActionsSource = await Bun.file(new URL("../src/ui/pwa/PwaStatusActions.tsx", import.meta.url)).text()

  expect(settingsSource).toContain("PwaStatusActions")
  expect(settingsSource).toContain('<PwaStatusActions placement="settings" state={pwa()} />')
  expect(pwaActionsSource).toContain('props.placement === "settings"')
  expect(pwaActionsSource).toContain("Install app")
  expect(pwaActionsSource).toContain("props.state.install()")
  expect(appSource).toContain('<PwaStatusActions placement="shell"')
  expect(appSource).not.toContain('placement="settings"')
  expect(pwaActionsSource).toContain('props.placement === "shell" && props.state.status() === "update-ready"')
  expect(pwaActionsSource).toContain("Reload to update")
  expect(pwaActionsSource).toContain("props.state.reloadForUpdate")
})

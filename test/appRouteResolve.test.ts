import { expect, test } from "bun:test"
import { appRouteResolve } from "../src/ui/appRouteResolve.js"

test("app routes the project files surface without changing workspace fallbacks", () => {
  expect(appRouteResolve("/explorer")).toBe("files")
  expect(appRouteResolve("/sessions")).toBe("workspace")
  expect(appRouteResolve("/sessions/new")).toBe("workspace")
  expect(appRouteResolve("/sessions/unknown-id")).toBe("workspace")
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
  expect(source).toContain("settingsIsActive")
})

test("settings is registered with the settings route page", async () => {
  const routerSource = await Bun.file(new URL("../src/ui/UiRouter.tsx", import.meta.url)).text()
  const settingsRoutesSource = await Bun.file(
    new URL("../src/ui/settings_url/getRoutesSettings.ts", import.meta.url),
  ).text()
  const settingsSource = await Bun.file(new URL("../src/ui/SettingsRoutePage.tsx", import.meta.url)).text()
  const settingsGeneralSource = await Bun.file(new URL("../src/ui/SettingsGeneralPanel.tsx", import.meta.url)).text()
  const settingsSidebarSource = await Bun.file(new URL("../src/ui/SettingsSidebar.tsx", import.meta.url)).text()

  expect(routerSource).toContain("getRoutesSettings")
  expect(settingsRoutesSource).toContain("pageNameSettings")
  expect(settingsRoutesSource).toContain("pageRouteSettings")
  expect(settingsRoutesSource).toContain("lazy")
  expect(settingsSource).toContain("SettingsSidebar")
  expect(settingsSource).toContain("ConfigurationEditor")
  expect(settingsGeneralSource).toContain('<h1 id="settings-title"')
  expect(settingsSidebarSource).toContain("Subagents")
  expect(settingsSidebarSource).toContain("Skills")
  expect(settingsSidebarSource).toContain("Commands")
})

test("the workspace is registered on the session sidebar routes instead of root", async () => {
  const routerSource = await Bun.file(new URL("../src/ui/UiRouter.tsx", import.meta.url)).text()
  const workspaceRoutesSource = await Bun.file(
    new URL("../src/ui/workspace_url/getRoutesWorkspace.ts", import.meta.url),
  ).text()

  expect(routerSource).toContain("getRoutesWorkspace")
  expect(workspaceRoutesSource).toContain("pageNameWorkspace")
  expect(workspaceRoutesSource).toContain("pageRouteWorkspace")
  expect(routerSource).not.toContain('<Route path="/" component={WorkspaceRoutePage} />')
})

test("primary navigation reuses the shell-owned mobile session drawer", async () => {
  const navigationSource = await Bun.file(new URL("../src/ui/primaryNavigationStateCreate.ts", import.meta.url)).text()

  expect(navigationSource).toContain("useContext(sessionDrawerContext)")
})

test("PWA installation is Settings-only while update reload remains in the shell", async () => {
  const appSource = await Bun.file(new URL("../src/ui/App.tsx", import.meta.url)).text()
  const settingsSource = await Bun.file(new URL("../src/ui/SettingsGeneralPanel.tsx", import.meta.url)).text()
  const pwaActionsSource = await Bun.file(new URL("../src/ui/pwa/PwaStatusActions.tsx", import.meta.url)).text()

  expect(settingsSource).toContain("PwaStatusActions")
  expect(settingsSource).toContain('<PwaStatusActions placement="settings" state={pwa()} />')
  expect(pwaActionsSource).toContain('props.placement === "settings"')
  expect(pwaActionsSource).toContain("Install app")
  expect(pwaActionsSource).toContain("props.state.install()")
  expect(appSource).toContain('<PwaStatusActions placement="shell"')
  expect(appSource).toContain("urlSettings")
  expect(appSource).toContain("href={urlSettings()}")
  expect(appSource).toContain("applicationIcon.settings")
  expect(appSource).not.toContain('placement="settings"')
  expect(pwaActionsSource).toContain('props.placement === "shell" && props.state.status() === "update-ready"')
  expect(pwaActionsSource).toContain("Reload to update")
  expect(pwaActionsSource).toContain("props.state.reloadForUpdate")
})

test("workspace actions keep the prominent session action and centralized project icon", async () => {
  const appSource = await Bun.file(new URL("../src/ui/App.tsx", import.meta.url)).text()

  expect(appSource).toContain("<ButtonIcon")
  expect(appSource).toContain("variant={buttonVariant.contrast}")
  expect(appSource).toContain("New session\n                  </ButtonIcon>")
  expect(appSource).toContain("icon={applicationIcon.projectCreate}")
  expect(appSource).toContain("grid-cols-[minmax(220px,max-content)_minmax(0,1fr)_auto]")
})

test("right-side header controls share the ghost utility-button treatment", async () => {
  const appSource = await Bun.file(new URL("../src/ui/App.tsx", import.meta.url)).text()
  const connectionSource = await Bun.file(new URL("../src/ui/ConnectionStatusIndicator.tsx", import.meta.url)).text()

  expect(appSource).toContain('navigation.settingsIsActive() && "bg-surface-hover text-foreground"')
  expect(connectionSource).toContain("variant={buttonVariant.ghost}")
})

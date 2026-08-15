import { expect, test } from "bun:test"
import { demoComponentSpecimenRegistry } from "../src/ui/demo/demoComponentSpecimenRegistry.js"
import { demoProjectEntriesFixture } from "../src/ui/demo/demoProjectEntriesFixture.js"
import { demoProjectEntryParentPath } from "../src/ui/demo/demoProjectEntryParentPath.js"
import { demoProjectPreviewsFixture } from "../src/ui/demo/demoProjectPreviewsFixture.js"
import { demoScreenSpecimenRegistry } from "../src/ui/demo/demoScreenSpecimenRegistry.js"

test("Project files views stay view-only and receive injected state", async () => {
  const filesPage = await Bun.file(new URL("../src/ui/FilesPage.tsx", import.meta.url)).text()
  const browser = await Bun.file(new URL("../src/project/ProjectBrowser.tsx", import.meta.url)).text()
  const gitPanel = await Bun.file(new URL("../src/project/ProjectGitPanel.tsx", import.meta.url)).text()

  expect(filesPage).toContain("props: { state: FilesScreenView }")
  expect(filesPage).not.toContain("filesPageStateCreate")
  expect(browser).toContain("state: ProjectBrowserView")
  expect(browser).not.toContain("projectBrowserStateCreate")
  expect(gitPanel).toContain("props: { state: ProjectGitPanelView }")
  expect(gitPanel).not.toContain("projectGitPanelStateCreate")
})

test("Project files route composes production state outside the view", async () => {
  const routePage = await Bun.file(new URL("../src/ui/FilesRoutePage.tsx", import.meta.url)).text()
  const router = await Bun.file(new URL("../src/ui/UiRouter.tsx", import.meta.url)).text()

  expect(routePage).toContain("filesScreenViewCreate")
  expect(router).toContain("component={FilesRoutePage}")
})

test("Files and project specimens are registered with representative variants", () => {
  const filesScreen = demoScreenSpecimenRegistry.find((specimen) => specimen.slug === "files-screen")
  const projectBrowser = demoComponentSpecimenRegistry.find((specimen) => specimen.slug === "project-browser")
  const gitPanel = demoComponentSpecimenRegistry.find((specimen) => specimen.slug === "project-git-panel")

  for (const specimen of [filesScreen, projectBrowser, gitPanel]) {
    expect(specimen).toBeDefined()
    expect(specimen?.variants).toContain("ready")
    expect(specimen?.variants).toContain("loading")
    expect(specimen?.variants).toContain("empty")
    expect(specimen?.variants).toContain("error")
  }

  expect(filesScreen?.href).toBe("/demo/screens/files-screen")
  expect(projectBrowser?.href).toBe("/demo/components/project-browser")
  expect(gitPanel?.href).toBe("/demo/components/project-git-panel")
})

test("Demo project fixtures describe a navigable tree with previews for every file", () => {
  expect(demoProjectEntryParentPath("src/ui/App.tsx")).toBe("src/ui")
  expect(demoProjectEntryParentPath("README.md")).toBe("")

  const rootEntries = demoProjectEntriesFixture.filter((entry) => demoProjectEntryParentPath(entry.path) === "")
  const srcEntries = demoProjectEntriesFixture.filter((entry) => demoProjectEntryParentPath(entry.path) === "src")

  expect(rootEntries.map((entry) => entry.path)).toContain("src")
  expect(srcEntries.map((entry) => entry.path)).toEqual(["src/ui", "src/index.ts"])

  const previews = demoProjectPreviewsFixture as Record<string, unknown>
  for (const entry of demoProjectEntriesFixture) {
    if (entry.type !== "file") continue
    expect(previews[entry.path]).toBeDefined()
  }
})

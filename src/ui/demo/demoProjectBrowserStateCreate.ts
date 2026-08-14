import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { markdownHtmlRender } from "../../markdown/markdownHtmlRender.js"
import type { ProjectApiPreviewResponse } from "../../project/api/projectApiPreviewResponseSchema.js"
import type { ProjectBrowserEntry, ProjectBrowserTab, ProjectBrowserView } from "../../project/projectBrowserView.js"
import { projectMimeTypeIsMarkdown } from "../../project/projectMimeTypeIsMarkdown.js"
import { demoProjectEntriesFixture } from "./demoProjectEntriesFixture.js"
import { demoProjectEntryParentPath } from "./demoProjectEntryParentPath.js"
import { demoProjectGitPanelStateCreate } from "./demoProjectGitPanelStateCreate.js"
import { demoProjectPreviewsFixture } from "./demoProjectPreviewsFixture.js"
import type { DemoSessionScreenVariant } from "./demoSessionScreenVariant.js"

const demoPreviewResolve = (path: string): ProjectApiPreviewResponse | null =>
  (demoProjectPreviewsFixture as Record<string, ProjectApiPreviewResponse | undefined>)[path] ?? null

/** Serves browser state from fixtures so specimens never touch the filesystem. */
export function demoProjectBrowserStateCreate(variant: () => DemoSessionScreenVariant): ProjectBrowserView {
  const tabs = createSignalObject<readonly ProjectBrowserTab[]>([{ displayMode: "source", path: "README.md" }])
  const activePath = createSignalObject<string | null>("README.md")
  const currentPath = createSignalObject("")

  const isEmpty = () => variant() === "empty"
  const selectedPath = () => (isEmpty() ? null : activePath.get())
  const preview = () => {
    const path = selectedPath()
    return path === null ? null : demoPreviewResolve(path)
  }
  const isMarkdownPreview = () => {
    const value = preview()
    return value?.kind === "text" && projectMimeTypeIsMarkdown(value.mimeType)
  }
  const displayModeOf = (path: string | null) => tabs.get().find((tab) => tab.path === path)?.displayMode ?? "source"

  const tabDisplayModeSet = (path: string, displayMode: "preview" | "source") => {
    tabs.set(tabs.get().map((tab) => (tab.path === path ? { ...tab, displayMode } : tab)))
  }

  return {
    currentPath: currentPath.get,
    directoryOpen: (entry: ProjectBrowserEntry) => currentPath.set(entry.path),
    directoryStatus: () => {
      if (variant() === "loading") return "loading"
      if (variant() === "error") return "error"
      return "complete"
    },
    displayMode: () => (variant() === "editing" ? "preview" : displayModeOf(selectedPath())),
    displayModeSelect: (displayMode: "preview" | "source") => {
      const path = selectedPath()
      if (path !== null) tabDisplayModeSet(path, displayMode)
    },
    downloadUrl: () => {
      const path = selectedPath()
      return path === null ? null : `data:text/plain;charset=utf-8,Demo%20download%20of%20${encodeURIComponent(path)}`
    },
    entries: () => {
      if (isEmpty()) return []
      const directory = currentPath.get()
      return demoProjectEntriesFixture.filter((entry) => demoProjectEntryParentPath(entry.path) === directory)
    },
    fileOpen: (entry: ProjectBrowserEntry) => {
      if (entry.type !== "file") return
      if (!tabs.get().some((tab) => tab.path === entry.path)) {
        tabs.set([...tabs.get(), { displayMode: "source", path: entry.path }])
      }
      activePath.set(entry.path)
    },
    git: demoProjectGitPanelStateCreate(variant),
    imagePreview: () => {
      const value = preview()
      return value?.kind === "image" ? value : null
    },
    isMarkdownPreview,
    markdownPreviewHtml: () => {
      const value = preview()
      if (value?.kind !== "text" || !projectMimeTypeIsMarkdown(value.mimeType)) return ""
      return markdownHtmlRender(value.content)
    },
    parentOpen: () => currentPath.set(demoProjectEntryParentPath(currentPath.get())),
    pdfPreview: () => {
      const value = preview()
      return value?.kind === "pdf" ? value : null
    },
    preview,
    previewStatus: () => {
      if (variant() === "loading") return "loading"
      if (variant() === "error") return "error"
      return "complete"
    },
    retryDirectory: () => {},
    retryPreview: () => {},
    selectedFile: () => {
      const path = selectedPath()
      return path === null ? null : { name: path.split("/").at(-1) ?? path, path }
    },
    tabClose: (path: string) => {
      const remaining = tabs.get().filter((tab) => tab.path !== path)
      tabs.set(remaining)
      if (activePath.get() === path) activePath.set(remaining.at(-1)?.path ?? null)
    },
    tabSelect: (path: string) => activePath.set(path),
    tabs: tabs.get,
    textPreview: () => {
      const value = preview()
      return value?.kind === "text" ? value : null
    },
  }
}

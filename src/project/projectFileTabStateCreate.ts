import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { createSignal } from "solid-js/dist/solid.js"
import { projectPathValidate } from "./projectPathValidate.js"

type ProjectFileTab = {
  path: string
}

function projectFileTabSignalObjectCreate<T>(value: T) {
  const [get, set] = createSignal(value)
  return { get, set }
}

function projectFileTabPathResolve(relativePath: string, op: string): Result<string> {
  const path = projectPathValidate(relativePath)
  if (!path.success) return createResultError(op, path.errorMessage)
  if (path.data.normalizedPath === "") return createResultError(op, "A file path is required")
  return createResult(path.data.normalizedPath)
}

export function projectFileTabStateCreate() {
  const tabs = projectFileTabSignalObjectCreate<readonly ProjectFileTab[]>([])
  const activePath = projectFileTabSignalObjectCreate<string | null>(null)

  const tabOpen = (relativePath: string): Result<ProjectFileTab> => {
    const op = "projectFileTabOpen"
    const path = projectFileTabPathResolve(relativePath, op)
    if (!path.success) return path

    const existing = tabs.get().find((tab) => tab.path === path.data)
    if (existing) {
      activePath.set(existing.path)
      return createResult(existing)
    }

    const tab = { path: path.data }
    tabs.set([...tabs.get(), tab])
    activePath.set(tab.path)
    return createResult(tab)
  }

  const tabSelect = (relativePath: string): Result<void> => {
    const op = "projectFileTabSelect"
    const path = projectFileTabPathResolve(relativePath, op)
    if (!path.success) return path
    if (!tabs.get().some((tab) => tab.path === path.data)) {
      return createResultError(op, "The file tab is not open")
    }

    activePath.set(path.data)
    return createResult(undefined)
  }

  const tabClose = (relativePath: string): Result<void> => {
    const op = "projectFileTabClose"
    const path = projectFileTabPathResolve(relativePath, op)
    if (!path.success) return path

    const currentTabs = tabs.get()
    const closedIndex = currentTabs.findIndex((tab) => tab.path === path.data)
    if (closedIndex < 0) return createResultError(op, "The file tab is not open")

    const remainingTabs = currentTabs.filter((tab) => tab.path !== path.data)
    tabs.set(remainingTabs)
    if (activePath.get() === path.data) {
      const fallback = remainingTabs[closedIndex - 1] ?? remainingTabs[0]
      activePath.set(fallback?.path ?? null)
    }
    return createResult(undefined)
  }

  return {
    activePath: activePath.get,
    tabClose,
    tabOpen,
    tabSelect,
    tabs: tabs.get,
  }
}

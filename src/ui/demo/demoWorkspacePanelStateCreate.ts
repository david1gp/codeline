import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { createMemo } from "solid-js"
import type { DemoWorkspaceFixture } from "./demoWorkspaceFixture.js"

export function demoWorkspacePanelStateCreate(fixture: () => DemoWorkspaceFixture) {
  const activeTabId = createSignalObject(fixture().activeTabId)
  const expandedDirectories = createSignalObject<readonly string[]>(["src", "src-ui", "docs"])
  const mode = createSignalObject<"diff" | "preview" | "source">(fixture().initialMode)
  const notice = createSignalObject(fixture().notice)
  const selectedLines = createSignalObject<readonly [number, number] | null>(null)
  const tab = createMemo(() => fixture().tabs.find((item) => item.id === activeTabId.get()) ?? fixture().tabs[0])

  const treeItemVisible = (parentId?: string): boolean => {
    if (!parentId) {
      return true
    }
    if (!expandedDirectories.get().includes(parentId)) {
      return false
    }
    return treeItemVisible(fixture().tree.find((item) => item.id === parentId)?.parentId)
  }

  const directoryToggle = (id: string) => {
    const expanded = expandedDirectories.get()
    expandedDirectories.set(expanded.includes(id) ? expanded.filter((item) => item !== id) : [...expanded, id])
  }
  const lineSelect = (line: number) => {
    const selected = selectedLines.get()
    selectedLines.set(selected ? [Math.min(selected[0], line), Math.max(selected[1], line)] : [line, line])
  }
  const mentionInsert = () => {
    const selected = selectedLines.get()
    notice.set(selected ? `Inserted @${tab()?.path}:L${selected[0]}-L${selected[1]}` : `Inserted @${tab()?.path}`)
  }
  const tabSelect = (id: string) => {
    const nextTab = fixture().tabs.find((item) => item.id === id)
    activeTabId.set(id)
    mode.set(nextTab?.kind === "source" ? "source" : "preview")
    selectedLines.set(null)
    notice.set(nextTab ? `${nextTab.path} · deterministic fixture` : fixture().notice)
  }

  return {
    activeTabId: activeTabId.get,
    collapseAll: () => expandedDirectories.set([]),
    directoryToggle,
    downloadPrepare: () => notice.set(`Prepared ${tab()?.label} for download`),
    expandedDirectories: expandedDirectories.get,
    lineSelect,
    mentionInsert,
    mode: mode.get,
    modeSelect: mode.set,
    notice: notice.get,
    refresh: () => notice.set("Tree refreshed · no filesystem request made"),
    selectedLines: selectedLines.get,
    tab,
    tabSelect,
    treeItemVisible,
    uploadOpen: () => notice.set(`Upload conflict · ${fixture().uploadConflict ?? "existing fixture file"}`),
  }
}

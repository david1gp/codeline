import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { useQuery } from "@rocicorp/zero/solid"
import type { Accessor } from "solid-js"
import { codelineQueries } from "./codelineQueries.js"
import { sessionBranchTreeStateCreate } from "./sessionBranchTreeStateCreate.js"
import type { SessionNavigationState } from "./sessionNavigationStateCreate.js"
import { sessionSearchResultAdapt } from "./sessionSearchResultAdapt.js"
import { sessionSearchStateCreate } from "./sessionSearchStateCreate.js"
import { sessionSidebarDerive } from "./sessionSidebarDerive.js"
import type { SessionSidebarTab } from "./sessionSidebarTab.js"

export function sessionListStateCreate(navigation: Accessor<SessionNavigationState>) {
  const [sessions, result] = useQuery(() => codelineQueries.activeSessions())
  const search = sessionSearchStateCreate(window)
  const activeTab = createSignalObject<SessionSidebarTab>(search.isActive() ? "search" : "recent")
  const visibleSessions = () => (search.isActive() ? search.sessions().map(sessionSearchResultAdapt) : sessions())
  const sidebarTabs = () => sessionSidebarDerive(sessions(), search.sessions())
  const activeRows = () => {
    const tab = activeTab.get()
    if (tab === "projects") return []
    return sidebarTabs()[tab]
  }
  const branchTree = sessionBranchTreeStateCreate({
    selectedSessionId: () => navigation().selectedSessionId(),
    sessions: visibleSessions,
  })

  return {
    roots: branchTree.roots,
    selectedAncestry: branchTree.selectedAncestry,
    sidebar: {
      activeTab: activeTab.get,
      activeRows,
      projectGroups: () => sidebarTabs().projects,
      selectTab: activeTab.set,
      tabs: sidebarTabs,
    },
    query: search.query,
    updateQuery: (value: string) => {
      activeTab.set("search")
      search.updateQuery(value)
    },
    isSelected: (sessionId: string) => navigation().selectedSessionId() === sessionId,
    isError: () => (activeTab.get() === "search" ? search.isError() : result().type === "error"),
    isLoading: () =>
      activeTab.get() === "search"
        ? search.isLoading() && activeRows().length === 0
        : result().type === "unknown" && sessions().length === 0,
    isEmpty: () => {
      const tab = activeTab.get()
      if (tab === "search") return !search.isActive() || (search.isComplete() && activeRows().length === 0)
      if (result().type !== "complete") return false
      return tab === "projects" ? sidebarTabs().projects.length === 0 : activeRows().length === 0
    },
    retry: () => {
      if (activeTab.get() === "search") {
        search.retry()
        return
      }
      const currentResult = result()
      if (currentResult.type === "error") currentResult.retry()
    },
    emptyMessage: () => {
      if (activeTab.get() === "search" && !search.isActive()) return "Enter a search term to find conversations."
      if (activeTab.get() === "search") return "No conversations match your search."
      if (activeTab.get() === "watched") return "No watched conversations."
      if (activeTab.get() === "projects") return "No projects with active conversations."
      return "No active conversations."
    },
    selectSession: (sessionId: string) => {
      navigation().selectSession(sessionId)
    },
  }
}

export type SessionListState = ReturnType<typeof sessionListStateCreate>

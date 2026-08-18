import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { useQuery } from "@rocicorp/zero/solid"
import { type Accessor, createEffect } from "solid-js"
import { codelineQueries } from "./codelineQueries.js"
import { sessionBranchTreeStateCreate } from "./sessionBranchTreeStateCreate.js"
import type { SessionNavigationState } from "./sessionNavigationStateCreate.js"
import { sessionSearchResultAdapt } from "./sessionSearchResultAdapt.js"
import { sessionSearchStateCreate } from "./sessionSearchStateCreate.js"
import { sessionSidebarActionsStateCreate } from "./sessionSidebarActionsStateCreate.js"
import { sessionSidebarDerive } from "./sessionSidebarDerive.js"
import type { SessionSidebarRouteState } from "./sessionSidebarRouteStateCreate.js"
import type { SessionSidebarTab } from "./sessionSidebarTab.js"
import { sessionSidebarWorkingIdsResolve } from "./sessionSidebarWorkingIdsResolve.js"

const defaultSessionsSidebarPageSize = 25

function sessionsSidebarPageSizeResolve() {
  const configured = Number(import.meta.env.VITE_SESSIONS_SIDEBAR_PAGE_SIZE)
  return Number.isInteger(configured) && configured > 0 ? configured : defaultSessionsSidebarPageSize
}

export function sessionListStateCreate(
  navigation: Accessor<SessionNavigationState>,
  sidebarRoute?: SessionSidebarRouteState,
) {
  const pageSize = sessionsSidebarPageSizeResolve()
  const loadedPageCount = createSignalObject(1)
  const [sessions, sessionsResult] = useQuery(() =>
    codelineQueries.activeSessions({ limit: loadedPageCount.get() * pageSize, start: null }),
  )
  const canLoadMore = createSignalObject(false)
  const isLoadingMore = createSignalObject(false)

  createEffect(() => {
    const currentResult = sessionsResult()
    if (currentResult.type === "unknown") return
    if (currentResult.type === "error") {
      isLoadingMore.set(false)
      return
    }
    canLoadMore.set(sessions().length === loadedPageCount.get() * pageSize)
    isLoadingMore.set(false)
  })

  const [activeRuns] = useQuery(() => codelineQueries.activeRuns())
  const search = sessionSearchStateCreate(window)
  const localActiveTab = createSignalObject<SessionSidebarTab>(search.isActive() ? "search" : "recent")
  const activeTab = sidebarRoute?.activeTab ?? localActiveTab.get
  const selectTab = sidebarRoute?.selectTab ?? localActiveTab.set
  const workingSessionIds = () => sessionSidebarWorkingIdsResolve(activeRuns())
  const sessionsWithWorking = () => {
    const working = workingSessionIds()
    return sessions().map((session) => ({ ...session, working: working.has(session.id) }))
  }
  const visibleSessions = () =>
    search.isActive() ? search.sessions().map(sessionSearchResultAdapt) : sessionsWithWorking()
  const sessionDeletedHandle = (sessionId: string) => {
    if (navigation().selectedSessionId() !== sessionId) return
    const next = sessions().find((session) => session.id !== sessionId)
    if (next === undefined) {
      navigation().clearSession()
      return
    }
    navigation().selectSession(next.id)
  }
  const actions = sessionSidebarActionsStateCreate({
    onSessionDeleted: sessionDeletedHandle,
    sessionIdsForProject: (projectPath) =>
      sessions()
        .filter((session) => session.projectPath === projectPath)
        .map((session) => session.id),
    sessionTitle: (sessionId) => sessions().find((session) => session.id === sessionId)?.title,
    sessionTitlesForProject: (projectPath) =>
      sessions()
        .filter((session) => session.projectPath === projectPath)
        .map((session) => session.title),
  })
  const sidebarTabs = () => {
    const overrides = Object.fromEntries(
      sessions().map((session) => [session.projectPath, actions.projectLabel(session.projectPath)]),
    )
    return sessionSidebarDerive(sessionsWithWorking(), search.sessions(), Date.now(), overrides)
  }
  const activeRows = () => {
    const tab = activeTab()
    if (tab === "projects") return []
    return sidebarTabs()[tab]
  }
  const branchTree = sessionBranchTreeStateCreate({
    selectedSessionId: () => navigation().selectedSessionId(),
    sessions: visibleSessions,
  })
  const loadMore = () => {
    if (isLoadingMore.get() || !canLoadMore.get()) return
    isLoadingMore.set(true)
    const currentResult = sessionsResult()
    if (currentResult.type === "error") {
      currentResult.retry()
      return
    }
    loadedPageCount.set(loadedPageCount.get() + 1)
  }

  return {
    roots: branchTree.roots,
    selectedAncestry: branchTree.selectedAncestry,
    sidebar: {
      activeTab,
      activeRows,
      canLoadMore: canLoadMore.get,
      isLoadingMore: isLoadingMore.get,
      loadMore,
      projectGroups: () => sidebarTabs().projects,
      selectTab,
      tabs: sidebarTabs,
    },
    query: search.query,
    updateQuery: (value: string) => {
      if (activeTab() !== "search") selectTab("search")
      search.updateQuery(value)
    },
    isSelected: (sessionId: string) => navigation().selectedSessionId() === sessionId,
    isError: () =>
      activeTab() === "search" ? search.isError() : sessionsResult().type === "error" && sessions().length === 0,
    isLoading: () =>
      activeTab() === "search"
        ? search.isLoading() && activeRows().length === 0
        : sessionsResult().type === "unknown" && sessions().length === 0,
    isEmpty: () => {
      const tab = activeTab()
      if (tab === "search") return !search.isActive() || (search.isComplete() && activeRows().length === 0)
      if (sessionsResult().type !== "complete") return false
      return tab === "projects" ? sidebarTabs().projects.length === 0 : activeRows().length === 0
    },
    retry: () => {
      if (activeTab() === "search") {
        search.retry()
        return
      }
      const currentResult = sessionsResult()
      if (currentResult.type === "error") currentResult.retry()
    },
    emptyMessage: () => {
      if (activeTab() === "search" && !search.isActive()) return "Enter a search term to find conversations."
      if (activeTab() === "search") return "No conversations match your search."
      if (activeTab() === "pinned") return "No pinned conversations."
      if (activeTab() === "projects") return "No projects with active conversations."
      return "No active conversations."
    },
    selectSession: (sessionId: string) => {
      navigation().selectSession(sessionId)
    },
    actions,
  }
}

export type SessionListState = ReturnType<typeof sessionListStateCreate>

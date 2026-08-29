import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { type Accessor, createEffect, onCleanup, useContext } from "solid-js"
import * as v from "valibot"
import { apiHttpClientCreate } from "../api/client/apiHttpClientCreate.js"
import type { ProjectRegistryState } from "../project/ui/projectRegistryStateCreate.js"
import type { SessionShell } from "../session/api/sessionShellSchema.js"
import { sessionListPageLoad } from "../session/client/sessionListPageLoad.js"
import { sessionRenameRequestSchema } from "../session/schema/sessionRenameRequestSchema.js"
import { sessionDeleteRequest } from "../session/ui/sessionDeleteRequest.js"
import { sessionEtagFetch } from "../session/ui/sessionEtagFetch.js"
import { sessionRenameRequest } from "../session/ui/sessionRenameRequest.js"
import { appShellContext } from "./appShellContext.js"
import { applicationAccountContext } from "./applicationAccountContext.js"
import { eventFeedCoordinatorContext } from "./eventFeedCoordinatorContext.js"
import { sessionBranchTreeStateCreate } from "./sessionBranchTreeStateCreate.js"
import type { SessionNavigationState } from "./sessionNavigationStateCreate.js"
import { sessionSearchResultAdapt } from "./sessionSearchResultAdapt.js"
import { sessionSearchStateCreate } from "./sessionSearchStateCreate.js"
import { sessionSidebarActionsStateCreate } from "./sessionSidebarActionsStateCreate.js"
import { sessionSidebarDerive } from "./sessionSidebarDerive.js"
import type { SessionSidebarRouteState } from "./sessionSidebarRouteStateCreate.js"
import type { SessionSidebarTab } from "./sessionSidebarTab.js"

const defaultSessionsSidebarPageSize = 25

type SessionListStateOptions = {
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  projectRegistry?: ProjectRegistryState
}

function sessionsSidebarPageSizeResolve() {
  const configured = Number(import.meta.env.VITE_SESSIONS_SIDEBAR_PAGE_SIZE)
  return Number.isInteger(configured) && configured > 0 ? configured : defaultSessionsSidebarPageSize
}

export function sessionListStateCreate(
  navigation: Accessor<SessionNavigationState>,
  sidebarRoute?: SessionSidebarRouteState,
  options: SessionListStateOptions = {},
) {
  const pageSize = sessionsSidebarPageSizeResolve()
  const appShell = useContext(appShellContext)
  const projectRegistry = options.projectRegistry ?? appShell?.projectRegistry
  const eventFeed = useContext(eventFeedCoordinatorContext)
  const account = useContext(applicationAccountContext)
  // A signed-out reader may only browse cached settled sessions; the
  // authenticated list endpoint is never called on their behalf. Without an
  // account provider the list is unscoped and stays enabled.
  const isSignedIn = () => account === undefined || account.userId() !== null
  const fetcher = options.fetcher ?? fetch
  const client = apiHttpClientCreate({ fetch: fetcher })
  const pageCursors = createSignalObject<Array<string | undefined>>([undefined])
  const pageResults = createSignalObject<SessionShell[][]>([])
  const nextCursor = createSignalObject<string | null>(null)
  const status = createSignalObject<"loading" | "complete" | "error">("loading")
  const isLoadingMore = createSignalObject(false)
  const refreshVersion = createSignalObject(0)
  const requestedPage = createSignalObject<{ cursor: string | undefined; index: number }>({
    cursor: undefined,
    index: 0,
  })

  const search = sessionSearchStateCreate(window, options)
  const localActiveTab = createSignalObject<SessionSidebarTab>(search.isActive() ? "search" : "recent")
  const activeTab = sidebarRoute?.activeTab ?? localActiveTab.get
  const selectTab = sidebarRoute?.selectTab ?? localActiveTab.set

  const sessions = () => pageResults.get().flat()
  const canLoadMore = () => nextCursor.get() !== null
  // The typed HTTP session list carries no run activity; working indicators arrive through the event feed.
  const sessionsWithWorking = () => sessions().map((session) => ({ ...session, working: false }))

  createEffect(() => {
    const requested = requestedPage.get()
    refreshVersion.get()
    if (!isSignedIn()) {
      pageResults.set([])
      nextCursor.set(null)
      status.set("complete")
      return
    }
    const { cursor, index: pageIndex } = requested
    if (pageIndex === 0) status.set("loading")

    void sessionListPageLoad(client, {
      limit: pageSize,
      ...(cursor === undefined ? {} : { cursor }),
    }).then((result) => {
      if (requestedPage.get() !== requested) return
      isLoadingMore.set(false)
      if (!result.success) {
        if (pageIndex === 0) status.set("error")
        return
      }
      const pages = pageResults.get().slice(0, pageIndex + 1)
      pages[pageIndex] = result.data.sessions
      pageResults.set(pages)
      nextCursor.set(result.data.nextCursor)
      status.set("complete")
    })
  })

  const sessionRename = async (sessionId: string, title: string): Promise<Result<string>> => {
    const op = "sessionListSessionRename"
    const parsed = v.safeParse(sessionRenameRequestSchema, { title })
    if (!parsed.success)
      return createResultError(
        op,
        title.trim().length === 0 ? "Enter a session title." : "Session titles can be at most 500 characters.",
      )
    const etag = await sessionEtagFetch(sessionId, { fetch: fetcher })
    if (!etag.success) return createResultError(op, "The session could not be renamed.")
    const renamed = await sessionRenameRequest(sessionId, parsed.output.title, { etag: etag.data, fetch: fetcher })
    if (!renamed.success) return createResultError(op, renamed.errorMessage)
    return createResult(renamed.data.session.title)
  }

  const sessionDelete = async (sessionId: string): Promise<Result<true>> => {
    const op = "sessionListSessionDelete"
    const etag = await sessionEtagFetch(sessionId, { fetch: fetcher })
    if (!etag.success) return createResultError(op, "The session could not be deleted.")
    const deleted = await sessionDeleteRequest(sessionId, { etag: etag.data, fetch: fetcher })
    if (!deleted.success) return createResultError(op, deleted.errorMessage)
    return createResult(true)
  }

  const sessionDeletedHandle = (sessionId: string) => {
    if (navigation().selectedSessionId() !== sessionId) return
    const next = sessions().find((session) => session.id !== sessionId)
    if (next === undefined) navigation().clearSession()
    else navigation().selectSession(next.id)
  }

  const actions = sessionSidebarActionsStateCreate({
    fetcher,
    onProjectRemoved: () => projectRegistry?.refresh(),
    onProjectRenamed: () => projectRegistry?.refresh(),
    onSessionDeleted: sessionDeletedHandle,
    projectRemove: projectRegistry ? (projectId) => projectRegistry.projectRemove(projectId) : undefined,
    projectRename: projectRegistry
      ? (projectId, title) => projectRegistry.projectRename(projectId, { displayName: title })
      : undefined,
    sessionDelete,
    sessionRename,
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
    const registered = projectRegistry ? projectRegistry.projects() : []
    return sessionSidebarDerive(sessionsWithWorking(), search.sessions(), Date.now(), overrides, registered)
  }
  const activeRows = () => {
    const tab = activeTab()
    if (tab === "projects") return []
    return sidebarTabs()[tab]
  }
  const visibleSessions = () =>
    search.isActive() ? search.sessions().map(sessionSearchResultAdapt) : sessionsWithWorking()
  const branchTree = sessionBranchTreeStateCreate({
    selectedSessionId: () => navigation().selectedSessionId(),
    sessions: visibleSessions,
  })

  const loadMore = () => {
    const cursor = nextCursor.get()
    if (status.get() === "loading" || isLoadingMore.get() || cursor === null || pageCursors.get().includes(cursor))
      return
    isLoadingMore.set(true)
    const cursors = [...pageCursors.get(), cursor]
    pageCursors.set(cursors)
    requestedPage.set({ cursor, index: cursors.length - 1 })
  }

  const revalidate = () => {
    if (activeTab() === "search") {
      search.revalidate()
      return
    }
    pageCursors.set([undefined])
    isLoadingMore.set(false)
    requestedPage.set({ cursor: undefined, index: 0 })
    refreshVersion.set(refreshVersion.get() + 1)
  }

  const unregisterEventFeed = eventFeed?.registerSessionList(revalidate)
  if (unregisterEventFeed !== undefined) onCleanup(unregisterEventFeed)

  return {
    roots: branchTree.roots,
    selectedAncestry: branchTree.selectedAncestry,
    sidebar: {
      activeTab,
      activeRows,
      canLoadMore,
      isLoadingMore: isLoadingMore.get,
      loadMore,
      projectGroups: () => sidebarTabs().projects,
      selectTab,
      tabs: sidebarTabs,
    },
    projectRegistry,
    query: search.query,
    refresh: revalidate,
    revalidate,
    updateQuery: (value: string) => {
      if (activeTab() !== "search") selectTab("search")
      search.updateQuery(value)
    },
    isSelected: (sessionId: string) => navigation().selectedSessionId() === sessionId,
    isError: () => (activeTab() === "search" ? search.isError() : status.get() === "error" && sessions().length === 0),
    isLoading: () =>
      activeTab() === "search"
        ? search.isLoading() && activeRows().length === 0
        : status.get() === "loading" && sessions().length === 0,
    isEmpty: () => {
      const tab = activeTab()
      if (tab === "search") return !search.isActive() || (search.isComplete() && activeRows().length === 0)
      if (status.get() !== "complete") return false
      return tab === "projects" ? sidebarTabs().projects.length === 0 : activeRows().length === 0
    },
    retry: () => {
      if (activeTab() === "search") {
        search.retry()
        return
      }
      pageCursors.set([undefined])
      pageResults.set([])
      nextCursor.set(null)
      isLoadingMore.set(false)
      requestedPage.set({ cursor: undefined, index: 0 })
      refreshVersion.set(refreshVersion.get() + 1)
    },
    emptyMessage: () => {
      if (!isSignedIn()) return "Sign in to see your conversations."
      if (activeTab() === "search" && !search.isActive()) return "Enter a search term to find conversations."
      if (activeTab() === "search") return "No conversations match your search."
      if (activeTab() === "pinned") return "No pinned conversations."
      if (activeTab() === "projects") return "No projects with active conversations."
      return "No active conversations."
    },
    selectSession: (sessionId: string) => navigation().selectSession(sessionId),
    actions,
  }
}

export type SessionListState = ReturnType<typeof sessionListStateCreate>

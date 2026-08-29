import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { projectFolderDisclosureStateCreate } from "../../project/ui/projectFolderDisclosureStateCreate.js"
import { sessionBranchTreeStateCreate } from "../sessionBranchTreeStateCreate.js"
import type { SessionListState } from "../sessionListStateCreate.js"
import { sessionSidebarActionsStateCreate } from "../sessionSidebarActionsStateCreate.js"
import { sessionSidebarDerive } from "../sessionSidebarDerive.js"
import type { SessionSidebarTab } from "../sessionSidebarTab.js"
import type { DemoSessionScreenVariant } from "./demoSessionScreenVariant.js"
import { demoWorkspaceSessionsFixture } from "./demoWorkspaceSessionsFixture.js"

type DemoSessionListStateOptions = {
  selectedSessionId: { get: () => string | null; set: (sessionId: string | null) => void }
  variant: () => DemoSessionScreenVariant
}

export function demoSessionListStateCreate(options: DemoSessionListStateOptions): SessionListState {
  const query = createSignalObject("")
  const isEmptyVariant = () => options.variant() === "empty"
  const activeTab = createSignalObject<SessionSidebarTab>("recent")
  const disclosure = projectFolderDisclosureStateCreate()
  const sidebarTabs = () =>
    sessionSidebarDerive(
      isEmptyVariant()
        ? []
        : demoWorkspaceSessionsFixture.map((session) => ({
            ...session,
            projectPath: "~",
            pinned: true,
            working: session.id === "demo-session-streaming",
          })),
      [],
    )
  const sessions = () => {
    if (isEmptyVariant()) return []
    const term = query.get().trim().toLowerCase()
    if (term.length === 0) return demoWorkspaceSessionsFixture
    return demoWorkspaceSessionsFixture.filter((session) => session.title.toLowerCase().includes(term))
  }
  const branchTree = sessionBranchTreeStateCreate({
    selectedSessionId: options.selectedSessionId.get,
    sessions,
  })
  const actions = sessionSidebarActionsStateCreate({
    sessionIdsForProject: () => sessions().map((session) => session.id),
    sessionTitle: (sessionId) => sessions().find((session) => session.id === sessionId)?.title,
    sessionTitlesForProject: () => sessions().map((session) => session.title),
  })
  const folderIsOpen = (folder: ReturnType<typeof sidebarTabs>["folders"][number]) =>
    disclosure.isFolderOpen(
      folder.id,
      folder.projects.some((project) =>
        project.sessions.some((row) => options.selectedSessionId.get() === row.session.id),
      ),
    )
  const folderToggle = (folderId: string, open: boolean) => disclosure.folderToggle(folderId, open)
  const projectIsOpen = (project: ReturnType<typeof sidebarTabs>["projects"][number]) =>
    project.sessions.some((row) => options.selectedSessionId.get() === row.session.id)

  return {
    actions,
    disclosure,
    emptyMessage: () =>
      query.get().trim().length > 0 ? "No conversations match your search." : "No active conversations.",
    isEmpty: () => sessions().length === 0,
    isError: () => options.variant() === "error",
    isLoading: () => options.variant() === "loading",
    isSelected: (sessionId: string) => options.selectedSessionId.get() === sessionId,
    folderIsOpen,
    folderToggle,
    projectIsOpen,
    query: query.get,
    projectRegistry: undefined,
    refresh: () => {},
    revalidate: () => {},
    retry: () => query.set(""),
    roots: branchTree.roots,
    selectedAncestry: branchTree.selectedAncestry,
    sidebar: {
      activeTab: activeTab.get,
      activeRows: () => {
        const tab = activeTab.get()
        if (tab === "projects") return []
        return sidebarTabs()[tab]
      },
      canLoadMore: () => false,
      folders: () => sidebarTabs().folders,
      isLoadingMore: () => false,
      loadMore: () => {},
      projectGroups: () => sidebarTabs().projects,
      selectTab: activeTab.set,
      tabs: sidebarTabs,
      uncategorizedProjects: () => sidebarTabs().uncategorizedProjects,
    },
    selectSession: (sessionId: string) => {
      options.selectedSessionId.set(sessionId)
    },
    updateQuery: (value: string) => {
      activeTab.set("search")
      query.set(value)
    },
  }
}

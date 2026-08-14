import { useQuery } from "@rocicorp/zero/solid"
import type { Accessor } from "solid-js"
import { codelineQueries } from "./codelineQueries.js"
import { sessionBranchTreeStateCreate } from "./sessionBranchTreeStateCreate.js"
import type { SessionNavigationState } from "./sessionNavigationStateCreate.js"
import { sessionSearchStateCreate } from "./sessionSearchStateCreate.js"

export function sessionListStateCreate(navigation: Accessor<SessionNavigationState>) {
  const [sessions, result] = useQuery(() => codelineQueries.activeSessions())
  const search = sessionSearchStateCreate(window)
  const visibleSessions = () =>
    search.isActive() ? search.sessions().map((row) => ({ ...row.session, updatedAt: 0 })) : sessions()
  const branchTree = sessionBranchTreeStateCreate({
    selectedSessionId: () => navigation().selectedSessionId(),
    sessions: visibleSessions,
  })

  return {
    roots: branchTree.roots,
    selectedAncestry: branchTree.selectedAncestry,
    query: search.query,
    updateQuery: search.updateQuery,
    isSelected: (sessionId: string) => navigation().selectedSessionId() === sessionId,
    isError: () => (search.isActive() ? search.isError() : result().type === "error"),
    isLoading: () =>
      search.isActive()
        ? search.isLoading() && visibleSessions().length === 0
        : result().type === "unknown" && sessions().length === 0,
    isRefreshing: () =>
      search.isActive()
        ? search.isLoading() && visibleSessions().length > 0
        : result().type === "unknown" && sessions().length > 0,
    isEmpty: () =>
      search.isActive()
        ? search.isComplete() && visibleSessions().length === 0
        : result().type === "complete" && sessions().length === 0,
    retry: () => {
      if (search.isActive()) {
        search.retry()
        return
      }
      const currentResult = result()
      if (currentResult.type === "error") currentResult.retry()
    },
    emptyMessage: () => (search.isActive() ? "No conversations match your search." : "No active conversations."),
    selectSession: (sessionId: string) => {
      if (branchTree.isLeaf(sessionId)) navigation().selectSession(sessionId)
    },
  }
}

import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { sessionBranchTreeStateCreate } from "../sessionBranchTreeStateCreate.js"
import type { SessionListState } from "../sessionListStateCreate.js"
import type { DemoSessionScreenVariant } from "./demoSessionScreenVariant.js"
import { demoWorkspaceSessionsFixture } from "./demoWorkspaceSessionsFixture.js"

type DemoSessionListStateOptions = {
  selectedSessionId: { get: () => string | null; set: (sessionId: string | null) => void }
  variant: () => DemoSessionScreenVariant
}

export function demoSessionListStateCreate(options: DemoSessionListStateOptions): SessionListState {
  const query = createSignalObject("")
  const isEmptyVariant = () => options.variant() === "empty"
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

  return {
    emptyMessage: () =>
      query.get().trim().length > 0 ? "No conversations match your search." : "No active conversations.",
    isEmpty: () => sessions().length === 0,
    isError: () => options.variant() === "error",
    isLoading: () => options.variant() === "loading",
    isRefreshing: () => options.variant() === "streaming",
    isSelected: (sessionId: string) => options.selectedSessionId.get() === sessionId,
    query: query.get,
    retry: () => query.set(""),
    roots: branchTree.roots,
    selectedAncestry: branchTree.selectedAncestry,
    selectSession: (sessionId: string) => {
      if (branchTree.isLeaf(sessionId)) options.selectedSessionId.set(sessionId)
    },
    updateQuery: query.set,
  }
}

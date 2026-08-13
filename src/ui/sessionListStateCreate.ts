import { useQuery } from "@rocicorp/zero/solid"
import type { Accessor } from "solid-js"
import { codelineQueries } from "./codelineQueries.js"
import type { SessionNavigationState } from "./sessionNavigationStateCreate.js"

export function sessionListStateCreate(navigation: Accessor<SessionNavigationState>) {
  const [sessions, result] = useQuery(() => codelineQueries.activeSessions())

  return {
    sessions,
    isSelected: (sessionId: string) => navigation().selectedSessionId() === sessionId,
    isError: () => result().type === "error",
    isLoading: () => result().type === "unknown" && sessions().length === 0,
    isRefreshing: () => result().type === "unknown" && sessions().length > 0,
    isEmpty: () => result().type === "complete" && sessions().length === 0,
    retry: () => {
      const currentResult = result()
      if (currentResult.type === "error") currentResult.retry()
    },
    selectSession: (sessionId: string) => navigation().selectSession(sessionId),
  }
}

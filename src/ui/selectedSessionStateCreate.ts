import { useQuery } from "@rocicorp/zero/solid"
import { createEffect, type Accessor } from "solid-js"
import { codelineQueries } from "./codelineQueries.js"
import type { SessionNavigationState } from "./sessionNavigationStateCreate.js"

export function selectedSessionStateCreate(navigation: Accessor<SessionNavigationState>) {
  const selectedSessionId = () => navigation().selectedSessionId()
  const [session, sessionResult] = useQuery(() => {
    const sessionId = selectedSessionId()
    return sessionId ? codelineQueries.activeSession({ sessionId }) : false
  })
  const [messages, messagesResult] = useQuery(() => {
    const activeSession = session()
    return activeSession ? codelineQueries.finalizedMessages({ sessionId: activeSession.id }) : false
  })

  createEffect(() => {
    if (selectedSessionId() === null || sessionResult().type !== "complete" || session() !== undefined) return
    navigation().clearSession()
  })

  return {
    session,
    messages: () => messages() ?? [],
    hasSelection: () => selectedSessionId() !== null,
    isSessionLoading: () =>
      selectedSessionId() !== null && sessionResult().type === "unknown" && session() === undefined,
    isSessionError: () => sessionResult().type === "error",
    isMessagesLoading: () => session() !== undefined && messagesResult().type === "unknown" && messages() === undefined,
    isMessagesRefreshing: () => messagesResult().type === "unknown" && (messages()?.length ?? 0) > 0,
    isMessagesError: () => messagesResult().type === "error",
    isMessagesEmpty: () => messagesResult().type === "complete" && (messages()?.length ?? 0) === 0,
    retrySession: () => {
      const currentResult = sessionResult()
      if (currentResult.type === "error") currentResult.retry()
    },
    retryMessages: () => {
      const currentResult = messagesResult()
      if (currentResult.type === "error") currentResult.retry()
    },
  }
}

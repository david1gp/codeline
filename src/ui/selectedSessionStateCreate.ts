import { useQuery } from "@rocicorp/zero/solid"
import { createEffect, type Accessor } from "solid-js"
import type { CodelineExecution } from "../providers/schema/codelineExecutionSchema.js"
import { codelineQueries } from "./codelineQueries.js"
import { finalizedMessageCopyStateCreate } from "../message/ui/finalizedMessageCopyStateCreate.js"
import { sessionRenameControlStateCreate } from "../session/ui/sessionRenameControlStateCreate.js"
import type { SelectedSessionView } from "./selectedSessionView.js"
import type { SessionNavigationState } from "./sessionNavigationStateCreate.js"
import { sessionChatStateCacheCreate } from "./sessionChatStateCacheCreate.js"
import { sessionChatStateCreate } from "./sessionChatStateCreate.js"
import { sessionInitialMessageStateCreate } from "./sessionInitialMessageStateCreate.js"
import { sessionWatchToggleStateCreate } from "./sessionWatchToggleStateCreate.js"
import { sessionDisplayModeStateCreate } from "./sessionDisplayModeStateCreate.js"
import { sessionStreamStateCreate } from "./sessionStreamStateCreate.js"
import { signalObjectCreate } from "./signalObjectCreate.js"

type SelectedSessionStateOptions = {
  codelineExecution: Accessor<CodelineExecution | null>
  navigation: Accessor<SessionNavigationState>
  sessionCreateStart: (projectPathOverride?: string) => Promise<string | null>
  sessionCreateErrorMessage: () => string | undefined
  sessionTargetAvailable: () => boolean
}

export function selectedSessionStateCreate(options: SelectedSessionStateOptions): SelectedSessionView {
  const displayMode = sessionDisplayModeStateCreate()
  const selectedSessionId = () => options.navigation().selectedSessionId()
  const [session, sessionResult] = useQuery(() => {
    const sessionId = selectedSessionId()
    return sessionId ? codelineQueries.activeSession({ sessionId }) : false
  })
  const [messages, messagesResult] = useQuery(() => {
    const activeSession = session()
    return activeSession ? codelineQueries.finalizedMessages({ sessionId: activeSession.id }) : false
  })
  const copyStates = new Map<string, ReturnType<typeof finalizedMessageCopyStateCreate>>()
  const durableMessages = () =>
    (messages() ?? []).map((message) => ({
      ...message,
      copyState: copyStates.get(message.id) ?? copyStateCreate(copyStates, message.id, message.content),
    }))
  const renameStates = new Map<string, ReturnType<typeof sessionRenameControlStateCreate>>()
  const watchStates = new Map<string, ReturnType<typeof sessionWatchToggleStateCreate>>()
  const renameState = () => {
    const current = session()
    if (!current) return undefined
    const existing = renameStates.get(current.id)
    if (existing) return existing
    const created = sessionRenameControlStateCreate({
      sessionId: () => current.id,
      title: () => current.title,
    })
    renameStates.set(current.id, created)
    return created
  }
  const watchState = () => {
    const current = session()
    if (!current) return undefined
    const existing = watchStates.get(current.id)
    if (existing) return existing
    const created = sessionWatchToggleStateCreate({
      sessionId: () => current.id,
      watched: () => session()?.watched ?? current.watched,
    })
    watchStates.set(current.id, created)
    return created
  }

  const chatCreate = sessionChatStateCacheCreate({
    chatStateCreate: sessionChatStateCreate,
    codelineExecution: options.codelineExecution,
    durableMessages,
  })
  const sessionReady = async (sessionId: string) => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (session()?.id === sessionId) return true
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    return false
  }
  const streamState = sessionStreamStateCreate({
    inFlightMessages: () => {
      const currentSession = session()
      return currentSession ? chatCreate(currentSession.id).pendingMessages() : []
    },
    isEnabled: () => displayMode.mode() === "stream",
    sessionId: () => session()?.id,
  })
  const initialMessage = sessionInitialMessageStateCreate({
    chatCreate,
    selectedSessionId,
    sessionCreateErrorMessage: options.sessionCreateErrorMessage,
    sessionCreateStart: options.sessionCreateStart,
    sessionReady,
    sessionTargetAvailable: options.sessionTargetAvailable,
  })
  const lastSession = signalObjectCreate<ReturnType<typeof session>>(undefined)
  const lastMessages = signalObjectCreate<ReturnType<typeof durableMessages>>([])

  createEffect(() => {
    const current = session()
    if (current !== undefined) lastSession.set(current)
    if (selectedSessionId() === null) lastSession.set(undefined)
  })
  createEffect(() => {
    const current = durableMessages()
    if (current.length > 0) lastMessages.set(current)
    if (selectedSessionId() === null) lastMessages.set([])
  })

  createEffect(() => {
    if (
      selectedSessionId() === null ||
      initialMessage.isVisible() ||
      sessionResult().type !== "complete" ||
      session() !== undefined
    )
      return
    options.navigation().clearSession()
  })

  return {
    chatCreate,
    displayMode,
    session: () => session() ?? lastSession.get(),
    initialChat: initialMessage.chat,
    isInitialChatVisible: initialMessage.isVisible,
    messages: () => {
      const current = durableMessages()
      return current.length > 0 ? current : lastMessages.get()
    },
    renameState,
    watchState,
    streamGroups: streamState.groups,
    isStreamLoading: streamState.isLoading,
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

function copyStateCreate(
  states: Map<string, ReturnType<typeof finalizedMessageCopyStateCreate>>,
  id: string,
  content: string,
) {
  const state = finalizedMessageCopyStateCreate({ content: () => content })
  states.set(id, state)
  return state
}

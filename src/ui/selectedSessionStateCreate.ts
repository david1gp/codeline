import { createResultError } from "@adaptive-ds/result"
import { type Accessor, createEffect, createMemo, onCleanup, useContext } from "solid-js"
import { finalizedMessageCopyStateCreate } from "../message/ui/finalizedMessageCopyStateCreate.js"
import type { CodelineExecution } from "../providers/schema/codelineExecutionSchema.js"
import { sessionDelegationsFetch } from "../run/ui/sessionDelegationsFetch.js"
import { sessionBoundedHistoryStateCreate } from "../session/client/sessionBoundedHistoryStateCreate.js"
import { sessionDetailSemanticStepCreate } from "../session/client/sessionDetailSemanticStepCreate.js"
import type { SessionDetailSourceFactory } from "../session/client/sessionDetailSourceFactory.js"
import { sessionDetailStateCreate } from "../session/client/sessionDetailStateCreate.js"
import { sessionLastActiveAccountRead } from "../session/client/sessionLastActiveAccountRead.js"
import { sessionLastActiveAccountWrite } from "../session/client/sessionLastActiveAccountWrite.js"
import { sessionReadOnlyNoticeResolve } from "../session/client/sessionReadOnlyNoticeResolve.js"
import { sessionReadOnlyReasonResolve } from "../session/client/sessionReadOnlyReasonResolve.js"
import { sessionEtagFetch } from "../session/ui/sessionEtagFetch.js"
import { sessionPinRequest } from "../session/ui/sessionPinRequest.js"
import { sessionRenameControlStateCreate } from "../session/ui/sessionRenameControlStateCreate.js"
import { sessionRenameRequest } from "../session/ui/sessionRenameRequest.js"
import { streamEventSourceCreate } from "../stream/client/streamEventSourceCreate.js"
import { apiFetchContext } from "./apiFetchContext.js"
import { applicationAccountContext } from "./applicationAccountContext.js"
import { appShellContext } from "./appShellContext.js"
import type { ChatCommandCatalogSource } from "./chatCommandView.js"
import { eventFeedCoordinatorContext } from "./eventFeedCoordinatorContext.js"
import { httpQueryStateCreate } from "./httpQueryStateCreate.js"
import type { SelectedSessionView } from "./selectedSessionView.js"
import { sessionChatStateCacheCreate } from "./sessionChatStateCacheCreate.js"
import { sessionChatStateCreate } from "./sessionChatStateCreate.js"
import { sessionChatStateReadOnlyWrap } from "./sessionChatStateReadOnlyWrap.js"
import { sessionDisplayModeStateCreate } from "./sessionDisplayModeStateCreate.js"
import { sessionInitialMessageStateCreate } from "./sessionInitialMessageStateCreate.js"
import type { SessionNavigationState } from "./sessionNavigationStateCreate.js"
import { sessionPinToggleStateCreate } from "./sessionPinToggleStateCreate.js"
import type { SessionProjectTarget } from "./sessionProjectTarget.js"
import { sessionStreamStateCreate } from "./sessionStreamStateCreate.js"
import { sessionSubagentThreadStateCreate } from "./sessionSubagentThreadStateCreate.js"
import { sessionViewAcknowledgeStateCreate } from "./sessionViewAcknowledgeStateCreate.js"

type SelectedSessionStateOptions = {
  codelineExecution: Accessor<CodelineExecution | null>
  /** Project command catalog backing composer slash-command autocomplete. */
  commandCatalog?: ChatCommandCatalogSource
  eventSourceFactory?: SessionDetailSourceFactory
  navigation: Accessor<SessionNavigationState>
  sessionCreateStart: (
    projectTarget?: SessionProjectTarget,
    command?: { arguments: string; name: string },
  ) => Promise<string | null>
  sessionCreateErrorMessage: () => string | undefined
  sessionTargetAvailable: () => boolean
  rightPanelClose: () => void
  rightPanelShow: () => void
}

export function selectedSessionStateCreate(options: SelectedSessionStateOptions): SelectedSessionView {
  const eventFeed = useContext(eventFeedCoordinatorContext)
  const account = useContext(applicationAccountContext)
  const fetcher = useContext(apiFetchContext)
  const pwa = useContext(appShellContext)?.pwa
  const displayMode = sessionDisplayModeStateCreate()
  const selectedSessionId = () => options.navigation().selectedSessionId()
  const selectedSessionKey = () => selectedSessionId() ?? undefined
  const isSignedIn = () => (account?.userId() ?? null) !== null
  const isOnline = () => pwa?.status() !== "offline"
  const selectedDetailEnabled = () => eventFeed?.eventFeed.selectedDetailEnabled() ?? true
  const cacheUserId = () => account?.userId() ?? sessionLastActiveAccountRead()
  createEffect(() => {
    const userId = account?.userId() ?? null
    if (userId !== null) sessionLastActiveAccountWrite(userId)
  })
  const boundedHistory = sessionBoundedHistoryStateCreate({
    enabled: () => isSignedIn() && isOnline(),
    ...(fetcher === undefined ? {} : { fetch: fetcher }),
    isOnline,
    sessionId: selectedSessionId,
    userId: cacheUserId,
  })
  const selectedDetail = sessionDetailStateCreate({
    enabled: () => isSignedIn() && isOnline() && selectedDetailEnabled(),
    eventSourceFactory: options.eventSourceFactory ?? streamEventSourceCreate,
    onAuthenticationError: () => eventFeed?.eventFeed.onAuthenticationError?.(),
    resnapshot: () => {
      if (!selectedDetailEnabled()) return
      return boundedHistory.refresh()
    },
    snapshot: boundedHistory.snapshot,
  })
  const semanticSteps = () => {
    const byId = new Map(boundedHistory.semanticSteps().map((step) => [step.id, step]))
    for (const entry of selectedDetail.entries()) {
      const step = sessionDetailSemanticStepCreate(entry)
      if (!step.success) continue
      const existing = byId.get(step.data.id)
      if (
        existing?.kind === "tool" &&
        step.data.kind === "tool" &&
        existing.childReference != null &&
        step.data.childReference == null
      )
        byId.set(step.data.id, { ...step.data, childReference: existing.childReference })
      else if (step.data.kind === "tool" && step.data.childReference == null) {
        const toolStep = step.data
        const delegation = delegations()?.find(
          (candidate) => candidate.parentRunId === toolStep.runId && candidate.delegationKey === toolStep.detailId,
        )
        byId.set(
          toolStep.id,
          delegation === undefined
            ? toolStep
            : {
                ...toolStep,
                childReference: {
                  childRunId: delegation.childRunId,
                  ...(delegation.childSessionId === null ? {} : { childSessionId: delegation.childSessionId }),
                  delegationId: delegation.delegationId,
                  parentSessionId: delegation.parentSessionId,
                },
              },
        )
      } else byId.set(step.data.id, step.data)
    }
    return [...byId.values()].sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id))
  }
  const liveSession = () => (boundedHistory.hasOnlineSnapshot() ? boundedHistory.snapshot()?.session : undefined)
  const session = () => boundedHistory.snapshot()?.session
  const sessionResult = () => ({
    retry: boundedHistory.retry,
    type:
      boundedHistory.isError() && boundedHistory.snapshot() === undefined
        ? ("error" as const)
        : (boundedHistory.isLoading() || boundedHistory.cacheStatus() === "loading") &&
            boundedHistory.snapshot() === undefined
          ? ("unknown" as const)
          : ("complete" as const),
  })
  const sessionView = sessionViewAcknowledgeStateCreate({ fetch: fetcher, isOnline })
  let viewedSelectionId: string | null = null
  const selectedSessionViewAcknowledge = (force = false) => {
    const sessionId = selectedSessionId()
    if (sessionId !== null) sessionView.acknowledge(sessionId, force)
  }
  const boundedMessages = () => {
    const latestAnswer = boundedHistory.latestAnswer()
    const messages = semanticSteps().flatMap((step) => {
      if (step.kind !== "message") return []
      return [
        {
          content: latestAnswer?.id === step.id ? latestAnswer.content : step.summary,
          id: step.id,
          role: step.role,
          sequence: step.sequence,
        },
      ]
    })
    if (latestAnswer === null || messages.some((message) => message.id === latestAnswer.id)) return messages
    return [...messages, latestAnswer].sort(
      (left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id),
    )
  }
  const messages = () => (boundedHistory.snapshot() === undefined ? undefined : boundedMessages())
  const messagesResult = () => ({
    retry: boundedHistory.retry,
    type:
      boundedHistory.isError() && boundedHistory.snapshot() === undefined
        ? ("error" as const)
        : (boundedHistory.isLoading() || boundedHistory.cacheStatus() === "loading") &&
            boundedHistory.snapshot() === undefined
          ? ("unknown" as const)
          : ("complete" as const),
  })
  const delegationsQuery = httpQueryStateCreate({
    enabled: () => isSignedIn() && liveSession()?.id === selectedSessionId(),
    key: selectedSessionKey,
    load: (sessionId, signal) => sessionDelegationsFetch(sessionId, { signal }),
  })
  const delegations = () => delegationsQuery.data()?.delegations
  const copyStates = new Map<string, ReturnType<typeof finalizedMessageCopyStateCreate>>()
  const durableMessages = () =>
    (messages() ?? []).map((message) => ({
      ...message,
      copyState: copyStates.get(message.id) ?? copyStateCreate(copyStates, message.id, message.content),
    }))
  const readOnlyReason = createMemo(() =>
    sessionReadOnlyReasonResolve({
      cacheStatus: boundedHistory.cacheStatus(),
      hasCachedSnapshot: boundedHistory.hasCachedSnapshot(),
      hasLiveSession: liveSession() !== undefined,
      isOnline: isOnline(),
      isSignedIn: isSignedIn(),
    }),
  )
  const readOnlyNotice = () => {
    const reason = readOnlyReason()
    return reason === null ? undefined : sessionReadOnlyNoticeResolve(reason)
  }
  const renameStates = new Map<string, ReturnType<typeof sessionRenameControlStateCreate>>()
  const pinStates = new Map<string, ReturnType<typeof sessionPinToggleStateCreate>>()
  const renameState = () => {
    const current = session()
    if (!current) return undefined
    const existing = renameStates.get(current.id)
    if (existing) return existing
    const created = sessionRenameControlStateCreate({
      sessionId: () => current.id,
      title: () => session()?.title ?? current.title,
      mutate: async (sessionId, title) => {
        const reason = readOnlyReason()
        if (reason !== null) return createResultError("selectedSessionRename", sessionReadOnlyNoticeResolve(reason))
        const etag = await sessionEtagFetch(sessionId, fetcher === undefined ? {} : { fetch: fetcher })
        if (!etag.success) return etag
        const result = await sessionRenameRequest(sessionId, title, {
          etag: etag.data,
          ...(fetcher === undefined ? {} : { fetch: fetcher }),
        })
        if (result.success) boundedHistory.refresh()
        return result
      },
    })
    renameStates.set(current.id, created)
    return created
  }
  const pinState = () => {
    const current = session()
    if (!current) return undefined
    const existing = pinStates.get(current.id)
    if (existing) return existing
    const created = sessionPinToggleStateCreate({
      sessionId: () => current.id,
      pinned: () => session()?.pinned ?? current.pinned,
      mutate: async (sessionId, pinned) => {
        const reason = readOnlyReason()
        if (reason !== null) return createResultError("selectedSessionPin", sessionReadOnlyNoticeResolve(reason))
        const etag = await sessionEtagFetch(sessionId, fetcher === undefined ? {} : { fetch: fetcher })
        if (!etag.success) return etag
        const result = await sessionPinRequest(sessionId, pinned, {
          etag: etag.data,
          ...(fetcher === undefined ? {} : { fetch: fetcher }),
        })
        if (result.success) boundedHistory.refresh()
        return result
      },
    })
    pinStates.set(current.id, created)
    return created
  }

  const chatCreateLive = sessionChatStateCacheCreate({
    authoritativeReloadVersion: boundedHistory.snapshotVersion,
    chatStateCreate: sessionChatStateCreate,
    codelineExecution: options.codelineExecution,
    ...(options.commandCatalog === undefined ? {} : { commandCatalog: options.commandCatalog }),
    durableMessages,
  })
  const readOnlyChats = new Map<string, ReturnType<typeof sessionChatStateReadOnlyWrap>>()
  const chatCreate = (sessionId: string) => {
    const live = chatCreateLive(sessionId)
    if (readOnlyReason() === null) return live
    const existing = readOnlyChats.get(sessionId)
    if (existing) return existing
    const wrapped = sessionChatStateReadOnlyWrap(live, () => readOnlyNotice() ?? "")
    readOnlyChats.set(sessionId, wrapped)
    return wrapped
  }
  const subagentThread = sessionSubagentThreadStateCreate({
    rightPanelClose: options.rightPanelClose,
    rightPanelShow: options.rightPanelShow,
    sessionId: selectedSessionId,
  })
  const streamDelegations = () =>
    (delegations() ?? []).map((delegation) => ({
      ...(delegation.childAgentId === undefined ? {} : { childAgentId: delegation.childAgentId }),
      childSessionId: delegation.childSessionId,
      childRunId: delegation.childRunId,
      delegationKey: delegation.delegationKey,
      id: delegation.id,
      parentAttemptId: delegation.parentAttemptId,
      parentRunId: delegation.parentRunId,
      parentSessionId: delegation.parentSessionId,
      task: delegation.task,
    }))
  const sessionReady = async (sessionId: string) => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (session()?.id === sessionId) return true
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    return false
  }
  const streamState = sessionStreamStateCreate({
    boundedState: boundedHistory.state,
    delegations: streamDelegations,
    detailEntries: selectedDetail.entries,
    inFlightRunId: () => {
      const currentSession = session()
      return currentSession ? (chatCreate(currentSession.id).runId?.() ?? null) : null
    },
    inFlightMessages: () => {
      const currentSession = session()
      return currentSession ? chatCreate(currentSession.id).pendingMessages() : []
    },
    isEnabled: () => displayMode.mode() === "stream" || subagentThread.selected() !== undefined,
    semanticSteps,
    sessionId: () => session()?.id,
  })
  const initialMessage = sessionInitialMessageStateCreate({
    chatCreate,
    ...(options.commandCatalog === undefined ? {} : { commandCatalog: options.commandCatalog }),
    selectedSessionId,
    sessionCreateErrorMessage: options.sessionCreateErrorMessage,
    sessionCreateStart: options.sessionCreateStart,
    sessionReady,
    sessionTargetAvailable: options.sessionTargetAvailable,
  })
  const revalidate = () => {
    const previousSnapshot = boundedHistory.snapshot()
    void boundedHistory.refresh().then(() => {
      if (boundedHistory.snapshot() === previousSnapshot) selectedDetail.reconnect()
    })
    delegationsQuery.refresh()
  }
  const boundedRefresh = () => boundedHistory.refresh()

  const unregisterEventFeed = [
    eventFeed?.registerSelectedSession({
      refresh: boundedRefresh,
      sessionId: selectedSessionId,
    }),
    eventFeed?.registerSelectedDelegations({
      refresh: () => {
        delegationsQuery.refresh()
      },
      sessionId: selectedSessionId,
    }),
  ].filter((unregister): unregister is () => void => unregister !== undefined)
  onCleanup(() => {
    for (const unregister of unregisterEventFeed) unregister()
  })

  createEffect(() => {
    const selectedId = selectedSessionId()
    if (selectedId !== viewedSelectionId) {
      if (viewedSelectionId !== null) sessionView.reset(viewedSelectionId)
      viewedSelectionId = selectedId
    }
    const current = liveSession()
    if (
      selectedId !== null &&
      current?.id === selectedId &&
      sessionResult().type === "complete" &&
      isOnline() &&
      isSignedIn()
    )
      selectedSessionViewAcknowledge()
  })

  createEffect(() => {
    if (
      selectedSessionId() === null ||
      initialMessage.isVisible() ||
      readOnlyReason() !== null ||
      sessionResult().type !== "complete" ||
      session() !== undefined
    )
      return
    options.navigation().clearSession()
  })

  return {
    chatCreate,
    displayMode,
    session,
    initialChat: initialMessage.chat,
    isInitialChatVisible: initialMessage.isVisible,
    messages: durableMessages,
    latestAnswer: boundedHistory.latestAnswer,
    compactState: boundedHistory.state,
    semanticSteps,
    throughPosition: boundedHistory.throughPosition,
    hasOlderHistory: boundedHistory.hasMore,
    isOlderHistoryError: boundedHistory.isOlderError,
    isOlderHistoryLoading: boundedHistory.isOlderLoading,
    loadOlderHistory: () => void boundedHistory.loadOlder(),
    retryOlderHistory: boundedHistory.retryOlder,
    readOnlyNotice,
    readOnlyReason,
    refresh: revalidate,
    revalidate,
    renameState,
    pinState,
    streamGroups: streamState.groups,
    isStreamLoading: streamState.isLoading,
    subagentThread,
    hasSelection: () => selectedSessionId() !== null,
    isSessionLoading: () =>
      selectedSessionId() !== null && sessionResult().type === "unknown" && session() === undefined,
    isSessionError: () => readOnlyReason() === null && sessionResult().type === "error" && session() === undefined,
    isMessagesLoading: () => session() !== undefined && messagesResult().type === "unknown" && messages() === undefined,
    isMessagesRefreshing: () => readOnlyReason() === null && boundedHistory.isRefreshing(),
    isMessagesError: () => readOnlyReason() === null && messagesResult().type === "error" && messages() === undefined,
    isMessagesEmpty: () =>
      (readOnlyReason() !== null || messagesResult().type === "complete") && (messages()?.length ?? 0) === 0,
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

import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import {
  type EventFeedCreateOptions,
  type EventFeedReconciliationCallbacks,
  eventFeedCreate,
} from "../events/client/eventFeedCreate.js"
import {
  type EventFeedOwnerRegistry,
  eventFeedOwnerRegistryCreate,
} from "../events/client/eventFeedOwnerRegistryCreate.js"
import type { EventFeedStaleResource } from "../stream/client/eventFeedStateCreate.js"
import { signalObjectCreate } from "./signalObjectCreate.js"
import type { UiDataLayerStatus } from "./uiDataLayerStatusSchema.js"

const tabEventFeedOwnerRegistry = eventFeedOwnerRegistryCreate()

type EventFeedRefreshCallback = () => void | Promise<void>
type EventFeedSelectedScope = string | (() => string | null | undefined)
type EventFeedSelectedRegistrationInput = {
  refresh: EventFeedRefreshCallback
  sessionId: EventFeedSelectedScope
}
type EventFeedNoteRegistrationInput = {
  noteId: EventFeedSelectedScope
  refresh: EventFeedRefreshCallback
}
type EventFeedSelectedRegistration = {
  refresh: EventFeedRefreshCallback
  scope: EventFeedSelectedScope
}
type EventFeedCoordinatorOptions = Omit<
  EventFeedCreateOptions,
  "onStateChange" | "ownershipRegistry" | "reconciliation"
> & {
  connectionIndicator: {
    statusSet: (status: UiDataLayerStatus) => void
  }
  ownershipRegistry?: EventFeedOwnerRegistry
  reconciliation: EventFeedReconciliationCallbacks
}

function eventFeedSelectedScopeResolve(scope: EventFeedSelectedScope): string | null | undefined {
  return typeof scope === "function" ? scope() : scope
}

function eventFeedSelectedInputResolve(
  input: EventFeedSelectedScope | EventFeedSelectedRegistrationInput,
  refresh: EventFeedRefreshCallback | undefined,
): EventFeedSelectedRegistration {
  if (typeof input === "object") return { refresh: input.refresh, scope: input.sessionId }
  if (refresh === undefined) throw new Error("An event-feed refresh callback is required.")
  return { refresh, scope: input }
}

function eventFeedNoteInputResolve(
  input: EventFeedSelectedScope | EventFeedNoteRegistrationInput,
  refresh: EventFeedRefreshCallback | undefined,
): EventFeedSelectedRegistration {
  if (typeof input === "object") return { refresh: input.refresh, scope: input.noteId }
  if (refresh === undefined) throw new Error("An event-feed refresh callback is required.")
  return { refresh, scope: input }
}

function eventFeedRegistrationUnregister<T>(registrations: Set<T>, registration: T): () => void {
  let registered = true
  return () => {
    if (!registered) return
    registered = false
    registrations.delete(registration)
  }
}

function eventFeedRefreshCallbacksUnique(
  callbacks: readonly EventFeedRefreshCallback[],
): readonly EventFeedRefreshCallback[] {
  return [...new Set(callbacks)]
}

async function eventFeedRefreshCallbacksRun(
  operation: string,
  callbacks: readonly EventFeedRefreshCallback[],
): Promise<Result<void>> {
  for (const callback of eventFeedRefreshCallbacksUnique(callbacks)) {
    try {
      await callback()
    } catch (_error) {
      return createResultError(operation, "The registered event-feed refresh callback failed.")
    }
  }
  return createResult(undefined)
}

/**
 * Owns the one browser-tab global-summary feed and adapts its reconciliation
 * to the narrow refresh seams exposed by the HTTP state modules.
 */
export function eventFeedCoordinatorStateCreate(options: EventFeedCoordinatorOptions) {
  const sessionList = new Set<EventFeedRefreshCallback>()
  const selectedSession = new Set<EventFeedSelectedRegistration>()
  const selectedDelegations = new Set<EventFeedSelectedRegistration>()
  const noteList = new Set<EventFeedRefreshCallback>()
  const noteDetail = new Set<EventFeedSelectedRegistration>()
  const runLifecycle = new Set<EventFeedRefreshCallback>()
  const selectedDetailEnabled = signalObjectCreate(true)
  let resetRefreshPending = false
  let closed = false
  let onlineRecovery: Promise<Result<void>> | undefined
  let onlineRecoveryEpoch = 0

  const selectedRegistrationsActive = (
    registrations: ReadonlySet<EventFeedSelectedRegistration>,
  ): readonly EventFeedSelectedRegistration[] =>
    [...registrations].filter((registration) => {
      const scope = eventFeedSelectedScopeResolve(registration.scope)
      return scope !== null && scope !== undefined
    })

  const selectedRegistrationsForSession = (
    registrations: ReadonlySet<EventFeedSelectedRegistration>,
    sessionId: string,
  ): readonly EventFeedSelectedRegistration[] =>
    [...registrations].filter((registration) => eventFeedSelectedScopeResolve(registration.scope) === sessionId)

  // A run start changes session-owned bounded active state but carries no
  // session revision. Refresh the bounded session directly instead of
  // synthesizing a revision or retaining global active-run state.
  const runStartedRefreshCallbacksResolve = (sessionId: string): readonly EventFeedRefreshCallback[] => [
    ...sessionList,
    ...selectedRegistrationsForSession(selectedSession, sessionId).map((registration) => registration.refresh),
  ]
  const terminalRefreshCallbacksResolve = (sessionId: string): readonly EventFeedRefreshCallback[] => [
    ...selectedRegistrationsForSession(selectedSession, sessionId).map((registration) => registration.refresh),
    ...selectedRegistrationsForSession(selectedDelegations, sessionId).map((registration) => registration.refresh),
    ...runLifecycle,
  ]

  const resourceRefreshCallbacksResolve = (resource: EventFeedStaleResource): readonly EventFeedRefreshCallback[] => {
    if (resource.resourceType === "session-list") return [...sessionList]
    if (resource.resourceType === "session") {
      return [
        ...sessionList,
        ...selectedRegistrationsForSession(selectedDelegations, resource.resourceId).map(
          (registration) => registration.refresh,
        ),
      ]
    }
    if (resource.resourceType === "run") {
      return selectedRegistrationsActive(selectedDelegations).map((registration) => registration.refresh)
    }
    if (resource.resourceType === "note") {
      return [
        ...noteList,
        ...[...noteDetail]
          .filter((registration) => eventFeedSelectedScopeResolve(registration.scope) === resource.resourceId)
          .map((registration) => registration.refresh),
      ]
    }
    return []
  }

  const resetRefreshCallbacksResolve = (): readonly EventFeedRefreshCallback[] => [
    ...sessionList,
    ...runLifecycle,
    ...selectedRegistrationsActive(selectedSession).map((registration) => registration.refresh),
    ...selectedRegistrationsActive(selectedDelegations).map((registration) => registration.refresh),
    ...noteList,
    ...selectedRegistrationsActive(noteDetail).map((registration) => registration.refresh),
  ]

  const stateChangeForward = (status: UiDataLayerStatus): void => {
    options.connectionIndicator.statusSet(status)
    if (resetRefreshPending && status.status !== "reconciling") resetRefreshPending = false
  }

  const reconciliation: EventFeedReconciliationCallbacks = {
    ...options.reconciliation,
    resourceRevalidate: async (resource) => {
      if (!resetRefreshPending) {
        const refreshed = await eventFeedRefreshCallbacksRun(
          "eventFeedCoordinatorResourceRefresh",
          resourceRefreshCallbacksResolve(resource),
        )
        if (!refreshed.success) return createResultError("eventFeedCoordinatorResourceRefresh", refreshed.errorMessage)
      }
      return options.reconciliation.resourceRevalidate(resource)
    },
    shellListBootstrap: async (instruction) => {
      resetRefreshPending = true
      selectedDetailEnabled.set(false)
      const bootstrap = await options.reconciliation.shellListBootstrap(instruction)
      if (!bootstrap.success) return bootstrap
      const refreshed = await eventFeedRefreshCallbacksRun(
        "eventFeedCoordinatorResetRefresh",
        resetRefreshCallbacksResolve(),
      )
      if (!refreshed.success) return createResultError("eventFeedCoordinatorResetRefresh", refreshed.errorMessage)
      selectedDetailEnabled.set(true)
      return bootstrap
    },
  }

  // `feed.dataState` reads plain mutable feed state, so this revision signal is
  // the tracked dependency for applied events and HTTP refreshes.
  const dataRevision = signalObjectCreate(0)
  const dataRevisionBump = (): void => {
    dataRevision.set(dataRevision.get() + 1)
  }

  const feed = eventFeedCreate({
    ...options,
    onEvent: (event) => {
      dataRevisionBump()
      options.onEvent?.(event)
      if (event.data.eventType === "reset") {
        resetRefreshPending = true
        selectedDetailEnabled.set(false)
        return
      }
      if (resetRefreshPending) return
      let refreshCallbacks: readonly EventFeedRefreshCallback[]
      if (event.data.eventType === "run-started")
        refreshCallbacks = [...runStartedRefreshCallbacksResolve(event.data.sessionId), ...runLifecycle]
      else if (event.data.eventType === "input-needed")
        refreshCallbacks = selectedRegistrationsForSession(selectedSession, event.data.sessionId).map(
          (registration) => registration.refresh,
        )
      else if (
        event.data.eventType === "run-completed" ||
        event.data.eventType === "run-failed" ||
        event.data.eventType === "run-cancelled" ||
        event.data.eventType === "run-interrupted"
      )
        refreshCallbacks = terminalRefreshCallbacksResolve(event.data.sessionId)
      else return
      void eventFeedRefreshCallbacksRun("eventFeedCoordinatorRunLifecycleRefresh", refreshCallbacks).then(
        (refreshed) => {
          if (!refreshed.success) options.onError?.(refreshed)
        },
      )
    },
    onStateChange: stateChangeForward,
    ownershipRegistry: options.ownershipRegistry ?? tabEventFeedOwnerRegistry,
    reconciliation,
  })

  const close = (): void => {
    if (closed) return
    closed = true
    resetRefreshPending = false
    selectedDetailEnabled.set(false)
    sessionList.clear()
    selectedSession.clear()
    selectedDelegations.clear()
    noteList.clear()
    noteDetail.clear()
    runLifecycle.clear()
    feed.close()
  }

  const onlineRecoveryRun = async (): Promise<Result<void>> => {
    if (closed) return createResult(undefined)
    const recoveryEpoch = onlineRecoveryEpoch
    // Keep the transport closed while the authoritative HTTP state is
    // refreshed. Otherwise events received on the reopened feed can race the
    // refresh responses and be overwritten by stale query data.
    selectedDetailEnabled.set(false)
    feed.reconnect()
    const refreshed = await eventFeedRefreshCallbacksRun(
      "eventFeedCoordinatorOnlineRecovery",
      resetRefreshCallbacksResolve(),
    )
    if (!closed && recoveryEpoch === onlineRecoveryEpoch) {
      if (!resetRefreshPending) selectedDetailEnabled.set(true)
      feed.online()
    }
    if (!refreshed.success) {
      options.onError?.(refreshed)
      return refreshed
    }
    if (closed || recoveryEpoch !== onlineRecoveryEpoch) return createResult(undefined)
    return feed.retryReconciliation()
  }

  const online = (): Promise<Result<void>> => {
    if (closed) return Promise.resolve(createResult(undefined))
    if (onlineRecovery !== undefined) return onlineRecovery
    const recovery = onlineRecoveryRun()
    onlineRecovery = recovery
    void recovery.then(() => {
      if (onlineRecovery === recovery) onlineRecovery = undefined
    })
    return recovery
  }

  const offline = (): void => {
    if (closed) return
    onlineRecoveryEpoch += 1
    onlineRecovery = undefined
    selectedDetailEnabled.set(false)
    feed.offline()
  }

  const registerSessionList = (refresh: EventFeedRefreshCallback): (() => void) => {
    if (closed) return () => undefined
    sessionList.add(refresh)
    return eventFeedRegistrationUnregister(sessionList, refresh)
  }
  const unregisterSessionList = (refresh: EventFeedRefreshCallback): void => {
    sessionList.delete(refresh)
  }
  const registerRunLifecycle = (refresh: EventFeedRefreshCallback): (() => void) => {
    if (closed) return () => undefined
    runLifecycle.add(refresh)
    return eventFeedRegistrationUnregister(runLifecycle, refresh)
  }
  const unregisterRunLifecycle = (refresh: EventFeedRefreshCallback): void => {
    runLifecycle.delete(refresh)
  }

  const registerSelected = (
    registrations: Set<EventFeedSelectedRegistration>,
    input: EventFeedSelectedScope | EventFeedSelectedRegistrationInput,
    refresh: EventFeedRefreshCallback | undefined,
  ): (() => void) => {
    if (closed) return () => undefined
    const registration = eventFeedSelectedInputResolve(input, refresh)
    registrations.add(registration)
    return eventFeedRegistrationUnregister(registrations, registration)
  }
  const unregisterSelected = (
    registrations: Set<EventFeedSelectedRegistration>,
    input: EventFeedSelectedScope | EventFeedSelectedRegistrationInput,
    refresh: EventFeedRefreshCallback | undefined,
  ): void => {
    const registration = eventFeedSelectedInputResolve(input, refresh)
    for (const current of registrations) {
      if (current.refresh === registration.refresh && current.scope === registration.scope)
        registrations.delete(current)
    }
  }

  const registerSelectedSession = (
    input: EventFeedSelectedScope | EventFeedSelectedRegistrationInput,
    refresh?: EventFeedRefreshCallback,
  ): (() => void) => registerSelected(selectedSession, input, refresh)
  const unregisterSelectedSession = (
    input: EventFeedSelectedScope | EventFeedSelectedRegistrationInput,
    refresh?: EventFeedRefreshCallback,
  ): void => unregisterSelected(selectedSession, input, refresh)
  const registerSelectedDelegations = (
    input: EventFeedSelectedScope | EventFeedSelectedRegistrationInput,
    refresh?: EventFeedRefreshCallback,
  ): (() => void) => registerSelected(selectedDelegations, input, refresh)
  const unregisterSelectedDelegations = (
    input: EventFeedSelectedScope | EventFeedSelectedRegistrationInput,
    refresh?: EventFeedRefreshCallback,
  ): void => unregisterSelected(selectedDelegations, input, refresh)
  const registerNoteList = (refresh: EventFeedRefreshCallback): (() => void) => {
    if (closed) return () => undefined
    noteList.add(refresh)
    return eventFeedRegistrationUnregister(noteList, refresh)
  }
  const unregisterNoteList = (refresh: EventFeedRefreshCallback): void => {
    noteList.delete(refresh)
  }
  const registerNoteDetail = (
    input: EventFeedSelectedScope | EventFeedNoteRegistrationInput,
    refresh?: EventFeedRefreshCallback,
  ): (() => void) => {
    if (closed) return () => undefined
    const registration = eventFeedNoteInputResolve(input, refresh)
    noteDetail.add(registration)
    return eventFeedRegistrationUnregister(noteDetail, registration)
  }
  const unregisterNoteDetail = (
    input: EventFeedSelectedScope | EventFeedNoteRegistrationInput,
    refresh?: EventFeedRefreshCallback,
  ): void => {
    const registration = eventFeedNoteInputResolve(input, refresh)
    for (const current of noteDetail) {
      if (current.refresh === registration.refresh && current.scope === registration.scope) noteDetail.delete(current)
    }
  }

  const feedApi = {
    cleanup: close,
    close,
    get dataState() {
      dataRevision.get()
      return feed.dataState
    },
    getState: feed.getState,
    getUrl: feed.getUrl,
    offline,
    online,
    onAuthenticationError: options.onAuthenticationError,
    retryReconciliation: feed.retryReconciliation,
    selectedDetailEnabled: selectedDetailEnabled.get,
    get state() {
      return feed.state
    },
  }

  // `dataState` and `state` are getters over live feed state. Spreading `feedApi`
  // would evaluate them once and freeze the coordinator on the initial, empty feed
  // snapshot, so the descriptors are copied instead of their current values.
  return Object.defineProperties(
    {
      eventFeed: feedApi,
      registerNoteDetail,
      registerNoteList,
      registerRunLifecycle,
      registerSelectedDelegations,
      registerSelectedSession,
      registerSessionList,
      unregisterNoteDetail,
      unregisterNoteList,
      unregisterRunLifecycle,
      unregisterSelectedDelegations,
      unregisterSelectedSession,
      unregisterSessionList,
    },
    Object.getOwnPropertyDescriptors(feedApi),
  ) as typeof feedApi & {
    eventFeed: typeof feedApi
    registerNoteDetail: typeof registerNoteDetail
    registerNoteList: typeof registerNoteList
    registerRunLifecycle: typeof registerRunLifecycle
    registerSelectedDelegations: typeof registerSelectedDelegations
    registerSelectedSession: typeof registerSelectedSession
    registerSessionList: typeof registerSessionList
    unregisterNoteDetail: typeof unregisterNoteDetail
    unregisterNoteList: typeof unregisterNoteList
    unregisterRunLifecycle: typeof unregisterRunLifecycle
    unregisterSelectedDelegations: typeof unregisterSelectedDelegations
    unregisterSelectedSession: typeof unregisterSelectedSession
    unregisterSessionList: typeof unregisterSessionList
  }
}

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
 * Owns the one browser-tab feed and adapts feed reconciliation to the narrow
 * refresh seams exposed by the HTTP state modules. Snapshot loading and
 * replacement remain injected through the shared event-feed callbacks.
 */
export function eventFeedCoordinatorStateCreate(options: EventFeedCoordinatorOptions) {
  const sessionList = new Set<EventFeedRefreshCallback>()
  const selectedSession = new Set<EventFeedSelectedRegistration>()
  const selectedMessages = new Set<EventFeedSelectedRegistration>()
  const selectedDelegations = new Set<EventFeedSelectedRegistration>()
  const selectedStream = new Set<EventFeedSelectedRegistration>()
  const noteList = new Set<EventFeedRefreshCallback>()
  const noteDetail = new Set<EventFeedSelectedRegistration>()
  let resetRefreshPending = false
  let closed = false
  let onlineRecovery: Promise<Result<void>> | undefined

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

  const resourceRefreshCallbacksResolve = (resource: EventFeedStaleResource): readonly EventFeedRefreshCallback[] => {
    if (resource.resourceType === "session-list") return [...sessionList]
    if (resource.resourceType === "session") {
      return [
        ...sessionList,
        ...selectedRegistrationsForSession(selectedSession, resource.resourceId).map(
          (registration) => registration.refresh,
        ),
        ...selectedRegistrationsForSession(selectedMessages, resource.resourceId).map(
          (registration) => registration.refresh,
        ),
        ...selectedRegistrationsForSession(selectedDelegations, resource.resourceId).map(
          (registration) => registration.refresh,
        ),
        ...selectedRegistrationsForSession(selectedStream, resource.resourceId).map(
          (registration) => registration.refresh,
        ),
      ]
    }
    if (resource.resourceType === "message")
      return selectedRegistrationsActive(selectedMessages).map((registration) => registration.refresh)
    if (resource.resourceType === "run") {
      return [
        ...selectedRegistrationsActive(selectedDelegations).map((registration) => registration.refresh),
        ...selectedRegistrationsActive(selectedStream).map((registration) => registration.refresh),
      ]
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
    ...selectedRegistrationsActive(selectedSession).map((registration) => registration.refresh),
    ...selectedRegistrationsActive(selectedMessages).map((registration) => registration.refresh),
    ...selectedRegistrationsActive(selectedDelegations).map((registration) => registration.refresh),
    ...selectedRegistrationsActive(selectedStream).map((registration) => registration.refresh),
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
    sessionSnapshotReplace: async (snapshot) => {
      const replaced = await options.reconciliation.sessionSnapshotReplace(snapshot)
      if (!replaced.success) return replaced
      // A completion checkpoint replaces assembled live state with the authoritative
      // HTTP snapshot. The settled cache alone is not what the workspace renders, so the
      // session's registered HTTP queries must be refreshed or the finalized transcript
      // never appears and the in-flight turn is never superseded.
      if (resetRefreshPending) return replaced
      const refreshed = await eventFeedRefreshCallbacksRun(
        "eventFeedCoordinatorSessionSnapshotRefresh",
        resourceRefreshCallbacksResolve({
          cachedRevision: null,
          resourceId: snapshot.session.id,
          resourceType: "session",
          serverRevision: snapshot.revision,
        }),
      )
      if (!refreshed.success)
        return createResultError("eventFeedCoordinatorSessionSnapshotRefresh", refreshed.errorMessage)
      return replaced
    },
    shellListBootstrap: async (instruction) => {
      const bootstrap = await options.reconciliation.shellListBootstrap(instruction)
      if (!bootstrap.success) return bootstrap
      resetRefreshPending = true
      const refreshed = await eventFeedRefreshCallbacksRun(
        "eventFeedCoordinatorResetRefresh",
        resetRefreshCallbacksResolve(),
      )
      if (!refreshed.success) return createResultError("eventFeedCoordinatorResetRefresh", refreshed.errorMessage)
      return bootstrap
    },
  }

  const feed = eventFeedCreate({
    ...options,
    onStateChange: stateChangeForward,
    ownershipRegistry: options.ownershipRegistry ?? tabEventFeedOwnerRegistry,
    reconciliation,
  })

  const close = (): void => {
    if (closed) return
    closed = true
    resetRefreshPending = false
    sessionList.clear()
    selectedSession.clear()
    selectedMessages.clear()
    selectedDelegations.clear()
    selectedStream.clear()
    noteList.clear()
    noteDetail.clear()
    feed.close()
  }

  const onlineRecoveryRun = async (): Promise<Result<void>> => {
    if (closed) return createResult(undefined)
    feed.online()
    const refreshed = await eventFeedRefreshCallbacksRun(
      "eventFeedCoordinatorOnlineRecovery",
      resetRefreshCallbacksResolve(),
    )
    if (!refreshed.success) {
      options.onError?.(refreshed)
      return refreshed
    }
    if (closed) return createResult(undefined)
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

  const registerSessionList = (refresh: EventFeedRefreshCallback): (() => void) => {
    if (closed) return () => undefined
    sessionList.add(refresh)
    return eventFeedRegistrationUnregister(sessionList, refresh)
  }
  const unregisterSessionList = (refresh: EventFeedRefreshCallback): void => {
    sessionList.delete(refresh)
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
  const registerSelectedMessages = (
    input: EventFeedSelectedScope | EventFeedSelectedRegistrationInput,
    refresh?: EventFeedRefreshCallback,
  ): (() => void) => registerSelected(selectedMessages, input, refresh)
  const unregisterSelectedMessages = (
    input: EventFeedSelectedScope | EventFeedSelectedRegistrationInput,
    refresh?: EventFeedRefreshCallback,
  ): void => unregisterSelected(selectedMessages, input, refresh)
  const registerSelectedDelegations = (
    input: EventFeedSelectedScope | EventFeedSelectedRegistrationInput,
    refresh?: EventFeedRefreshCallback,
  ): (() => void) => registerSelected(selectedDelegations, input, refresh)
  const unregisterSelectedDelegations = (
    input: EventFeedSelectedScope | EventFeedSelectedRegistrationInput,
    refresh?: EventFeedRefreshCallback,
  ): void => unregisterSelected(selectedDelegations, input, refresh)
  const registerSelectedStream = (
    input: EventFeedSelectedScope | EventFeedSelectedRegistrationInput,
    refresh?: EventFeedRefreshCallback,
  ): (() => void) => registerSelected(selectedStream, input, refresh)
  const unregisterSelectedStream = (
    input: EventFeedSelectedScope | EventFeedSelectedRegistrationInput,
    refresh?: EventFeedRefreshCallback,
  ): void => unregisterSelected(selectedStream, input, refresh)

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
    activeRunAttach: feed.activeRunAttach,
    cleanup: close,
    close,
    get dataState() {
      return feed.dataState
    },
    getState: feed.getState,
    getUrl: feed.getUrl,
    offline: feed.offline,
    online,
    retryReconciliation: feed.retryReconciliation,
    get state() {
      return feed.state
    },
  }

  return {
    ...feedApi,
    eventFeed: feedApi,
    registerNoteDetail,
    registerNoteList,
    registerSelectedDelegations,
    registerSelectedMessages,
    registerSelectedSession,
    registerSelectedStream,
    registerSessionList,
    unregisterNoteDetail,
    unregisterNoteList,
    unregisterSelectedDelegations,
    unregisterSelectedMessages,
    unregisterSelectedSession,
    unregisterSelectedStream,
    unregisterSessionList,
  }
}

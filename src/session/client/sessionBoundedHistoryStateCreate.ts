import type { IDBPDatabase } from "idb"
import { createEffect, onCleanup, untrack } from "solid-js"
import { httpQueryStateCreate } from "../../ui/httpQueryStateCreate.js"
import { signalObjectCreate } from "../../ui/signalObjectCreate.js"
import type { SessionBoundedHistoryPage } from "../api/sessionBoundedHistoryPageSchema.js"
import type { SessionBoundedSnapshot } from "../api/sessionBoundedSnapshotSchema.js"
import type { SessionSemanticStep } from "../api/sessionSemanticStepSchema.js"
import { sessionCacheDatabaseOpen } from "../storage/sessionCacheDatabaseOpen.js"
import type { SessionCacheDatabaseSchema } from "../storage/sessionCacheDatabaseSchema.js"
import { sessionCacheHistoryPageRead } from "../storage/sessionCacheHistoryPageRead.js"
import { sessionCacheHistoryPageWrite } from "../storage/sessionCacheHistoryPageWrite.js"
import { sessionCacheSnapshotRead } from "../storage/sessionCacheSnapshotRead.js"
import { sessionCacheSnapshotReplace } from "../storage/sessionCacheSnapshotReplace.js"
import { sessionBoundedHistoryPageFetch } from "./sessionBoundedHistoryPageFetch.js"
import { sessionBoundedSnapshotFetch } from "./sessionBoundedSnapshotFetch.js"
import type { SessionCacheStatus } from "./sessionCacheStatus.js"

type SessionBoundedHistoryStateOptions = {
  database?: IDBPDatabase<SessionCacheDatabaseSchema>
  enabled?: () => boolean
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  isOnline?: () => boolean
  now?: () => number
  sessionId: () => string | null
  userId?: () => string | null
}

type OlderHistoryStatus = "error" | "idle" | "loading"

function sessionSemanticStepKey(step: SessionSemanticStep): string {
  return `${step.sequence}:${step.id}`
}

function sessionSemanticStepsPrepend(
  current: readonly SessionSemanticStep[],
  older: readonly SessionSemanticStep[],
): readonly SessionSemanticStep[] {
  const seen = new Set(current.map(sessionSemanticStepKey))
  const prepend: SessionSemanticStep[] = []
  for (const step of older) {
    const key = sessionSemanticStepKey(step)
    if (seen.has(key)) continue
    seen.add(key)
    prepend.push(step)
  }
  return [...prepend, ...current]
}

function sessionSemanticStepsReplace(
  current: readonly SessionSemanticStep[],
  replacement: readonly SessionSemanticStep[],
): readonly SessionSemanticStep[] {
  const byId = new Map(current.map((step) => [step.id, step]))
  for (const step of replacement) byId.set(step.id, step)
  return [...byId.values()].sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id))
}

/**
 * Owns one bounded selected-session snapshot and pages backward at its fixed
 * watermark. A changed watermark or cursor cycle discards assembled pages and
 * falls back to a new authoritative bounded snapshot rather than mixing views.
 */
export function sessionBoundedHistoryStateCreate(options: SessionBoundedHistoryStateOptions) {
  const selectedSessionKey = () => {
    const sessionId = options.sessionId()
    if (sessionId === null) return undefined
    return `${options.userId?.() ?? ""}\u0000${sessionId}`
  }
  const sessionIdFromKey = (key: string): string => key.slice(key.indexOf("\u0000") + 1)
  const remoteEnabled = () => (options.enabled?.() ?? true) && (options.isOnline?.() ?? true)
  const query = httpQueryStateCreate({
    enabled: remoteEnabled,
    key: selectedSessionKey,
    load: (key, signal) =>
      sessionBoundedSnapshotFetch(sessionIdFromKey(key), {
        ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
        signal,
      }),
  })
  const cachedSnapshot = signalObjectCreate<SessionBoundedSnapshot | undefined>(undefined)
  const cacheReadStatus = signalObjectCreate<"error" | "loading" | "ready">("loading")
  const olderSteps = signalObjectCreate<readonly SessionSemanticStep[]>([])
  const nextCursor = signalObjectCreate<string | null>(null)
  const olderStatus = signalObjectCreate<OlderHistoryStatus>("idle")
  const olderErrorMessage = signalObjectCreate<string | undefined>(undefined)
  const resnapshotRequired = signalObjectCreate(false)
  const snapshotVersion = signalObjectCreate(0)
  const loadedCursors = new Set<string>()
  let installedSnapshot: SessionBoundedSnapshot | undefined
  let pageController: AbortController | undefined
  let generation = 0
  let cacheGeneration = 0
  let databaseOpen: ReturnType<typeof sessionCacheDatabaseOpen> | undefined
  let snapshotPersistence: Promise<void> | undefined

  const databaseResolve = async (): Promise<IDBPDatabase<SessionCacheDatabaseSchema> | undefined> => {
    if (options.database !== undefined) return options.database
    databaseOpen ??= sessionCacheDatabaseOpen()
    const opened = await databaseOpen
    return opened.success ? opened.data : undefined
  }

  const onlineSnapshot = () => {
    if (!remoteEnabled()) return undefined
    const snapshot = query.data()
    const sessionId = options.sessionId()
    return snapshot?.session.id === sessionId ? snapshot : undefined
  }

  const selectedSnapshot = () => {
    const snapshot = onlineSnapshot() ?? cachedSnapshot.get()
    const sessionId = options.sessionId()
    return snapshot?.session.id === sessionId ? snapshot : undefined
  }

  const pagesReset = (): void => {
    generation += 1
    pageController?.abort()
    pageController = undefined
    loadedCursors.clear()
    olderSteps.set([])
    nextCursor.set(selectedSnapshot()?.olderCursor ?? null)
  }

  createEffect(() => {
    const snapshot = selectedSnapshot()
    if (snapshot === installedSnapshot) return
    installedSnapshot = snapshot
    untrack(pagesReset)
    olderStatus.set("idle")
    olderErrorMessage.set(undefined)
    resnapshotRequired.set(false)
    if (snapshot !== undefined) snapshotVersion.set(snapshotVersion.get() + 1)
  })

  createEffect(() => {
    const sessionId = options.sessionId()
    const userId = options.userId?.() ?? null
    const activeGeneration = ++cacheGeneration
    cachedSnapshot.set(undefined)
    cacheReadStatus.set("loading")
    untrack(pagesReset)
    if (sessionId === null || userId === null) {
      cacheReadStatus.set("ready")
      return
    }

    void (async () => {
      const database = await databaseResolve()
      if (activeGeneration !== cacheGeneration || database === undefined) {
        if (activeGeneration === cacheGeneration) cacheReadStatus.set("error")
        return
      }
      const read = await sessionCacheSnapshotRead(database, { sessionId, userId })
      if (activeGeneration !== cacheGeneration) return
      if (!read.success) {
        cacheReadStatus.set("error")
        return
      }
      cachedSnapshot.set(read.data)
      cacheReadStatus.set("ready")
    })()
  })

  createEffect(() => {
    const snapshot = onlineSnapshot()
    const userId = options.userId?.() ?? null
    if (snapshot === undefined || userId === null) return
    const activeGeneration = cacheGeneration
    const sessionId = snapshot.session.id
    const persistence = (async () => {
      const database = await databaseResolve()
      if (database === undefined) return
      const replaced = await sessionCacheSnapshotReplace(database, {
        snapshot,
        storedAt: options.now?.() ?? Date.now(),
        userId,
      })
      if (
        !replaced.success ||
        activeGeneration !== cacheGeneration ||
        options.userId?.() !== userId ||
        options.sessionId() !== sessionId
      )
        return
      cachedSnapshot.set(snapshot)
      cacheReadStatus.set("ready")
    })()
    snapshotPersistence = persistence
  })

  onCleanup(() => {
    cacheGeneration += 1
    pageController?.abort()
    if (options.database === undefined) void databaseOpen?.then((opened) => opened.success && opened.data.close())
  })

  const authoritativeResnapshot = (message?: string): void => {
    pagesReset()
    if (message === undefined) {
      olderStatus.set("idle")
      olderErrorMessage.set(undefined)
      resnapshotRequired.set(false)
    } else {
      olderStatus.set("error")
      olderErrorMessage.set(message)
      resnapshotRequired.set(true)
    }
    query.refresh()
  }

  const loadOlder = async (): Promise<void> => {
    const snapshot = selectedSnapshot()
    const sessionId = options.sessionId()
    const cursor = nextCursor.get()
    if (snapshot === undefined || sessionId === null || cursor === null || olderStatus.get() === "loading") return
    if (loadedCursors.has(cursor)) {
      authoritativeResnapshot("The history cursor repeated. The conversation is being reloaded.")
      return
    }

    const activeGeneration = generation
    const controller = new AbortController()
    pageController?.abort()
    pageController = controller
    olderStatus.set("loading")
    olderErrorMessage.set(undefined)

    const userId = options.userId?.() ?? null
    let cachedPage: SessionBoundedHistoryPage | undefined
    if (userId !== null) {
      const database = await databaseResolve()
      if (database !== undefined && !controller.signal.aborted && activeGeneration === generation) {
        const read = await sessionCacheHistoryPageRead(database, { requestCursor: cursor, sessionId, userId })
        if (
          read.success &&
          read.data !== undefined &&
          read.data.throughPosition === snapshot.throughPosition &&
          selectedSnapshot() === snapshot
        ) {
          cachedPage = read.data
          olderSteps.set((current) => sessionSemanticStepsReplace(current, read.data?.semanticSteps ?? []))
          nextCursor.set(read.data.nextCursor)
          loadedCursors.add(cursor)
          olderStatus.set("idle")
        }
      }
    }
    if (controller.signal.aborted || activeGeneration !== generation || selectedSnapshot() !== snapshot) return
    if (!remoteEnabled()) {
      pageController = undefined
      if (cachedPage === undefined) {
        olderStatus.set("error")
        olderErrorMessage.set("Older history is not available in the offline cache.")
      }
      return
    }

    const result = await sessionBoundedHistoryPageFetch(sessionId, cursor, {
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      signal: controller.signal,
    })
    if (controller.signal.aborted || activeGeneration !== generation || selectedSnapshot() !== snapshot) return
    pageController = undefined
    if (!result.success) {
      if (cachedPage !== undefined) {
        olderStatus.set("idle")
        return
      }
      if (result.statusCode === 400 || result.code === "invalid_response") {
        authoritativeResnapshot("Older history no longer matches this conversation. It is being reloaded.")
        return
      }
      olderStatus.set("error")
      olderErrorMessage.set(result.errorMessage)
      return
    }
    if (result.data.throughPosition !== snapshot.throughPosition) {
      authoritativeResnapshot("The conversation changed while older history was loading. It is being reloaded.")
      return
    }

    loadedCursors.add(cursor)
    olderSteps.set((current) => sessionSemanticStepsReplace(current, result.data.semanticSteps))
    nextCursor.set(result.data.nextCursor)
    olderStatus.set("idle")
    olderErrorMessage.set(undefined)
    if (userId !== null) {
      await snapshotPersistence
      const database = await databaseResolve()
      if (database !== undefined && activeGeneration === generation && selectedSnapshot() === snapshot) {
        await sessionCacheHistoryPageWrite(database, {
          page: result.data,
          requestCursor: cursor,
          sessionId,
          storedAt: options.now?.() ?? Date.now(),
          userId,
        })
      }
    }
  }

  const semanticSteps = (): readonly SessionSemanticStep[] => {
    const recent = selectedSnapshot()?.semanticSteps ?? []
    return sessionSemanticStepsPrepend(recent, olderSteps.get())
  }

  const cacheStatus = (): SessionCacheStatus => {
    if (cacheReadStatus.get() === "loading") return "loading"
    if (onlineSnapshot() !== undefined) return "ready"
    if (!(options.isOnline?.() ?? true)) return selectedSnapshot() === undefined ? "ready" : "offline"
    if (query.isLoading() && selectedSnapshot() !== undefined) return "revalidating"
    if (cacheReadStatus.get() === "error" || query.isError()) return "error"
    return "ready"
  }

  return {
    cacheStatus,
    errorMessage: query.errorMessage,
    hasMore: () => nextCursor.get() !== null,
    isError: query.isError,
    isLoading: query.isLoading,
    isOlderError: () => olderStatus.get() === "error",
    isOlderLoading: () => olderStatus.get() === "loading",
    isRefreshing: () => query.isLoading() && selectedSnapshot() !== undefined,
    hasCachedSnapshot: () => cachedSnapshot.get() !== undefined,
    hasOnlineSnapshot: () => onlineSnapshot() !== undefined,
    latestAnswer: () => selectedSnapshot()?.latestAnswer ?? null,
    loadOlder,
    olderErrorMessage: olderErrorMessage.get,
    refresh: () => authoritativeResnapshot(),
    retry: query.retry,
    retryOlder: () => {
      if (resnapshotRequired.get()) {
        query.retry()
        return
      }
      void loadOlder()
    },
    semanticSteps,
    snapshot: selectedSnapshot,
    snapshotVersion: snapshotVersion.get,
    state: () => selectedSnapshot()?.state,
    throughPosition: () => selectedSnapshot()?.throughPosition,
  }
}

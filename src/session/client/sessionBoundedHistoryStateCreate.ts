import { createEffect, onCleanup } from "solid-js"
import { httpQueryStateCreate } from "../../ui/httpQueryStateCreate.js"
import { signalObjectCreate } from "../../ui/signalObjectCreate.js"
import type { SessionSemanticStep } from "../api/sessionSemanticStepSchema.js"
import { sessionBoundedHistoryPageFetch } from "./sessionBoundedHistoryPageFetch.js"
import { sessionBoundedSnapshotFetch } from "./sessionBoundedSnapshotFetch.js"

type SessionBoundedHistoryStateOptions = {
  enabled?: () => boolean
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  sessionId: () => string | null
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

/**
 * Owns one bounded selected-session snapshot and pages backward at its fixed
 * watermark. A changed watermark or cursor cycle discards assembled pages and
 * falls back to a new authoritative bounded snapshot rather than mixing views.
 */
export function sessionBoundedHistoryStateCreate(options: SessionBoundedHistoryStateOptions) {
  const selectedSessionKey = () => options.sessionId() ?? undefined
  const query = httpQueryStateCreate({
    enabled: options.enabled,
    key: selectedSessionKey,
    load: (sessionId, signal) =>
      sessionBoundedSnapshotFetch(sessionId, {
        ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
        signal,
      }),
  })
  const olderSteps = signalObjectCreate<readonly SessionSemanticStep[]>([])
  const nextCursor = signalObjectCreate<string | null>(null)
  const olderStatus = signalObjectCreate<OlderHistoryStatus>("idle")
  const olderErrorMessage = signalObjectCreate<string | undefined>(undefined)
  const resnapshotRequired = signalObjectCreate(false)
  const snapshotVersion = signalObjectCreate(0)
  const loadedCursors = new Set<string>()
  let installedSnapshot = query.data()
  let pageController: AbortController | undefined
  let generation = 0

  const selectedSnapshot = () => {
    const snapshot = query.data()
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
    pagesReset()
    olderStatus.set("idle")
    olderErrorMessage.set(undefined)
    resnapshotRequired.set(false)
    if (snapshot !== undefined) snapshotVersion.set(snapshotVersion.get() + 1)
  })

  onCleanup(() => pageController?.abort())

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
    const result = await sessionBoundedHistoryPageFetch(sessionId, cursor, {
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      signal: controller.signal,
    })
    if (controller.signal.aborted || activeGeneration !== generation || selectedSnapshot() !== snapshot) return
    pageController = undefined
    if (!result.success) {
      if (result.statusCode === 400 || result.code === "invalid_response") {
        authoritativeResnapshot("Older history no longer matches this conversation. It is being reloaded.")
        return
      }
      olderStatus.set("error")
      olderErrorMessage.set(result.errorMessage)
      return
    }
    if (result.data.throughSeq !== snapshot.throughSeq) {
      authoritativeResnapshot("The conversation changed while older history was loading. It is being reloaded.")
      return
    }

    loadedCursors.add(cursor)
    olderSteps.set((current) => sessionSemanticStepsPrepend(current, result.data.semanticSteps))
    nextCursor.set(result.data.nextCursor)
    olderStatus.set("idle")
    olderErrorMessage.set(undefined)
  }

  const semanticSteps = (): readonly SessionSemanticStep[] => {
    const recent = selectedSnapshot()?.semanticSteps ?? []
    return sessionSemanticStepsPrepend(recent, olderSteps.get())
  }

  return {
    errorMessage: query.errorMessage,
    hasMore: () => nextCursor.get() !== null,
    isError: query.isError,
    isLoading: query.isLoading,
    isOlderError: () => olderStatus.get() === "error",
    isOlderLoading: () => olderStatus.get() === "loading",
    isRefreshing: () => query.isLoading() && selectedSnapshot() !== undefined,
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
    throughSeq: () => selectedSnapshot()?.throughSeq,
  }
}

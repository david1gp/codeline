import { createResult, createResultError } from "@adaptive-ds/result"
import type { IDBPDatabase } from "idb"
import { onCleanup, useContext } from "solid-js"
import type { RunDetailResponse } from "../run/api/runDetailResponseSchema.js"
import type { RunToolDetailResponse } from "../run/api/runToolDetailResponseSchema.js"
import { runDetailFetch } from "../run/ui/runDetailFetch.js"
import { runToolDetailFetch } from "../run/ui/runToolDetailFetch.js"
import type { SessionSemanticStep } from "../session/api/sessionSemanticStepSchema.js"
import { sessionLastActiveAccountRead } from "../session/client/sessionLastActiveAccountRead.js"
import { sessionCacheDatabaseOpen } from "../session/storage/sessionCacheDatabaseOpen.js"
import type { SessionCacheDatabaseSchema } from "../session/storage/sessionCacheDatabaseSchema.js"
import { sessionCacheRunDetailRead } from "../session/storage/sessionCacheRunDetailRead.js"
import { sessionCacheRunDetailWrite } from "../session/storage/sessionCacheRunDetailWrite.js"
import { sessionCacheToolDetailRead } from "../session/storage/sessionCacheToolDetailRead.js"
import { sessionCacheToolDetailWrite } from "../session/storage/sessionCacheToolDetailWrite.js"
import { apiFetchContext } from "./apiFetchContext.js"
import { applicationAccountContext } from "./applicationAccountContext.js"
import { appShellContext } from "./appShellContext.js"
import { httpQueryStateCreate } from "./httpQueryStateCreate.js"
import type { SessionChildConversationLink } from "./sessionChildConversationLink.js"
import { signalObjectCreate } from "./signalObjectCreate.js"

type SessionSemanticStepRowStateOptions = {
  database?: IDBPDatabase<SessionCacheDatabaseSchema>
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  isOnline?: () => boolean
  now?: () => number
  onChildConversation?: (link: SessionChildConversationLink) => void
  sessionId: () => string
  step: () => SessionSemanticStep
  userId?: () => string | null
}

export function sessionSemanticStepRowStateCreate(options: SessionSemanticStepRowStateOptions) {
  const fetcher = useContext(apiFetchContext)
  const account = useContext(applicationAccountContext)
  const pwa = useContext(appShellContext)?.pwa
  const expanded = signalObjectCreate(false)
  let databaseOpen: ReturnType<typeof sessionCacheDatabaseOpen> | undefined

  const databaseResolve = async (): Promise<IDBPDatabase<SessionCacheDatabaseSchema> | undefined> => {
    if (options.database !== undefined) return options.database
    databaseOpen ??= sessionCacheDatabaseOpen()
    const opened = await databaseOpen
    return opened.success ? opened.data : undefined
  }
  const signedInUserId = () => options.userId?.() ?? account?.userId() ?? null
  const cacheUserId = () => signedInUserId() ?? sessionLastActiveAccountRead()
  const isOnline = () => options.isOnline?.() ?? pwa?.status() !== "offline"
  const remoteEnabled = () => isOnline() && (account === undefined || signedInUserId() !== null)

  onCleanup(() => {
    if (options.database === undefined) void databaseOpen?.then((opened) => opened.success && opened.data.close())
  })
  const key = () => {
    const step = options.step()
    if (step.kind !== "run" && step.kind !== "tool") return undefined
    return `${cacheUserId() ?? ""}\u0000${options.sessionId()}:${step.kind}:${step.detailId}`
  }
  const query = httpQueryStateCreate<RunDetailResponse | RunToolDetailResponse>({
    enabled: expanded.get,
    key,
    load: async (_key, signal) => {
      const step = options.step()
      const sessionId = options.sessionId()
      const userId = cacheUserId()
      const selectedFetch = options.fetch ?? fetcher
      const dependencies = { ...(selectedFetch === undefined ? {} : { fetch: selectedFetch }), signal }
      if (step.kind !== "run" && step.kind !== "tool")
        return createResultError("sessionSemanticStepDetailLoad", "This activity has no full details.")

      const database = userId === null ? undefined : await databaseResolve()
      const cached =
        database === undefined || userId === null
          ? undefined
          : step.kind === "run"
            ? await sessionCacheRunDetailRead(database, { runId: step.detailId, sessionId, userId })
            : await sessionCacheToolDetailRead(database, {
                detailId: step.detailId,
                runId: step.runId,
                sessionId,
                userId,
              })
      if (!remoteEnabled()) {
        if (cached?.success && cached.data !== undefined) return createResult(cached.data)
        return createResultError("sessionSemanticStepDetailLoad", "Full details are not available offline.")
      }

      const loaded =
        step.kind === "run"
          ? await runDetailFetch(sessionId, step.detailId, dependencies)
          : await runToolDetailFetch(sessionId, step.runId, step.detailId, dependencies)
      if (!loaded.success) {
        if (cached?.success && cached.data !== undefined) return createResult(cached.data)
        return loaded
      }
      if (signal.aborted || database === undefined || userId === null || loaded.data.kind !== "finalized") return loaded

      if (step.kind === "run") {
        await sessionCacheRunDetailWrite(database, {
          detail: loaded.data as RunDetailResponse,
          runId: step.detailId,
          sessionId,
          storedAt: options.now?.() ?? Date.now(),
          userId,
        })
        return loaded
      }
      await sessionCacheToolDetailWrite(database, {
        detail: loaded.data as RunToolDetailResponse,
        detailId: step.detailId,
        runId: step.runId,
        sessionId,
        storedAt: options.now?.() ?? Date.now(),
        userId,
      })
      return loaded
    },
  })

  return {
    childConversationOpen: (event?: Event) => {
      event?.stopPropagation()
      const step = options.step()
      if (step.kind !== "tool" || step.childReference == null) return
      const childSessionId = step.childReference.childSessionId
      options.onChildConversation?.({
        ...(typeof childSessionId === "string" ? { childSessionId } : {}),
        childRunId: step.childReference.childRunId,
        delegationId: step.childReference.delegationId,
        parentSessionId: step.childReference.parentSessionId,
        task: step.summary,
      })
    },
    detail: query.data,
    detailExpand: () => expanded.set(true),
    detailRetry: query.retry,
    isDetailError: query.isError,
    isDetailLoading: query.isLoading,
  }
}

import { createResult, createResultError } from "@adaptive-ds/result"
import type { IDBPDatabase } from "idb"
import { onCleanup, useContext } from "solid-js"
import { finalizedMessageCopyStateCreate } from "../message/ui/finalizedMessageCopyStateCreate.js"
import type { RunDetailResponse } from "../run/api/runDetailResponseSchema.js"
import { runChildConversationDetailFetch } from "../run/ui/runChildConversationDetailFetch.js"
import { sessionBoundedHistoryStateCreate } from "../session/client/sessionBoundedHistoryStateCreate.js"
import { sessionLastActiveAccountRead } from "../session/client/sessionLastActiveAccountRead.js"
import { sessionCacheDatabaseOpen } from "../session/storage/sessionCacheDatabaseOpen.js"
import type { SessionCacheDatabaseSchema } from "../session/storage/sessionCacheDatabaseSchema.js"
import { sessionCacheRunDetailRead } from "../session/storage/sessionCacheRunDetailRead.js"
import { sessionCacheRunDetailWrite } from "../session/storage/sessionCacheRunDetailWrite.js"
import { apiFetchContext } from "./apiFetchContext.js"
import { applicationAccountContext } from "./applicationAccountContext.js"
import { appShellContext } from "./appShellContext.js"
import { httpQueryStateCreate } from "./httpQueryStateCreate.js"
import type { SessionChildConversationLink } from "./sessionChildConversationLink.js"
import { signalObjectCreate } from "./signalObjectCreate.js"

type ChildSessionConversationStateOptions = {
  database?: IDBPDatabase<SessionCacheDatabaseSchema>
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  isOnline?: () => boolean
  now?: () => number
}

export function childSessionConversationStateCreate(
  link: () => SessionChildConversationLink,
  options: ChildSessionConversationStateOptions = {},
) {
  const account = useContext(applicationAccountContext)
  const fetcher = useContext(apiFetchContext)
  const pwa = useContext(appShellContext)?.pwa
  const history = sessionBoundedHistoryStateCreate({
    ...(fetcher === undefined ? {} : { fetch: fetcher }),
    enabled: () => link().childSessionId !== undefined,
    sessionId: () => link().childSessionId ?? null,
    userId: () => account?.userId() ?? null,
  })
  let databaseOpen: ReturnType<typeof sessionCacheDatabaseOpen> | undefined
  const cachedDetail = signalObjectCreate<RunDetailResponse | undefined>(undefined)
  const cachedDetailKey = signalObjectCreate<string | undefined>(undefined)
  const databaseResolve = async (): Promise<IDBPDatabase<SessionCacheDatabaseSchema> | undefined> => {
    if (options.database !== undefined) return options.database
    databaseOpen ??= sessionCacheDatabaseOpen()
    const opened = await databaseOpen
    return opened.success ? opened.data : undefined
  }
  const signedInUserId = () => account?.userId() ?? null
  const cacheUserId = () => signedInUserId() ?? sessionLastActiveAccountRead()
  const isOnline = () => options.isOnline?.() ?? pwa?.status() !== "offline"
  const remoteEnabled = () => isOnline() && (account === undefined || signedInUserId() !== null)
  const detailKey = () => {
    const current = link()
    const userId = cacheUserId()
    if (
      current.childSessionId !== undefined ||
      userId === null ||
      current.childRunId === undefined ||
      current.delegationId === undefined ||
      current.parentSessionId.trim().length === 0
    )
      return undefined
    return `${userId}\u0000${current.parentSessionId}\u0000${current.delegationId}\u0000${current.childRunId}`
  }
  const query = httpQueryStateCreate<RunDetailResponse>({
    enabled: () => link().childSessionId === undefined,
    key: detailKey,
    load: async (key, signal) => {
      const current = link()
      if (current.childRunId === undefined || current.delegationId === undefined)
        return createResultError(
          "childSessionConversationDetailLoad",
          "The child conversation identifiers are required.",
        )
      const userId = cacheUserId()
      const database = userId === null ? undefined : await databaseResolve()
      const cached =
        database === undefined || userId === null
          ? undefined
          : await sessionCacheRunDetailRead(database, {
              delegationId: current.delegationId,
              runId: current.childRunId,
              sessionId: current.parentSessionId,
              userId,
            })
      if (cached?.success && cached.data !== undefined && detailKey() === key) {
        cachedDetail.set(cached.data)
        cachedDetailKey.set(key)
      }
      if (!remoteEnabled()) {
        if (cached?.success && cached.data !== undefined && detailKey() === key) return createResult(cached.data)
        return createResultError(
          "childSessionConversationDetailLoad",
          "The child conversation is not available offline.",
        )
      }

      const loaded = await runChildConversationDetailFetch(
        current.parentSessionId,
        current.childRunId,
        current.delegationId,
        {
          ...((options.fetch ?? fetcher) === undefined ? {} : { fetch: options.fetch ?? fetcher }),
          signal,
        },
      )
      if (!loaded.success) {
        if (cached?.success && cached.data !== undefined && detailKey() === key) return createResult(cached.data)
        return loaded
      }
      if (
        loaded.data.kind === "finalized" &&
        (loaded.data.detail.run.id !== current.childRunId ||
          loaded.data.detail.run.sessionId !== current.parentSessionId)
      ) {
        if (cached?.success && cached.data !== undefined && detailKey() === key) return createResult(cached.data)
        return createResultError(
          "childSessionConversationDetailLoad",
          "The child conversation detail identity is invalid.",
        )
      }
      if (
        loaded.data.kind === "finalized" &&
        !signal.aborted &&
        database !== undefined &&
        userId !== null &&
        detailKey() === key
      )
        await sessionCacheRunDetailWrite(database, {
          delegationId: current.delegationId,
          detail: loaded.data,
          runId: current.childRunId,
          sessionId: current.parentSessionId,
          storedAt: options.now?.() ?? Date.now(),
          userId,
        })
      return loaded
    },
  })
  onCleanup(() => {
    if (options.database === undefined) void databaseOpen?.then((opened) => opened.success && opened.data.close())
  })
  const childDetail = {
    ...query,
    data: () => query.data() ?? (cachedDetailKey.get() === detailKey() ? cachedDetail.get() : undefined),
  }
  const copyState = finalizedMessageCopyStateCreate({
    content: () => {
      const answer = history.latestAnswer()?.content
      if (answer !== undefined) return answer
      const detail = childDetail.data()
      return detail?.kind === "finalized" ? detail.detail.transcript.assistantText : ""
    },
  })
  return { childDetail, copyState, history }
}

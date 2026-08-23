import { createEffect, onCleanup } from "solid-js"
import { sessionLastActiveAccountRead } from "../session/client/sessionLastActiveAccountRead.js"
import { sessionLastActiveAccountWrite } from "../session/client/sessionLastActiveAccountWrite.js"
import { sessionSettledCacheDatabaseConfig } from "../session/client/sessionSettledCacheDatabaseConfig.js"
import { sessionSettledCacheStateCreate } from "../session/client/sessionSettledCacheStateCreate.js"
import type { SessionSettledCacheStatus } from "../session/client/sessionSettledCacheStatus.js"
import type { SessionSettledRecord } from "../session/schema/sessionSettledRecordSchema.js"
import { sessionSettledDatabaseOpen } from "../session/storage/sessionSettledDatabaseOpen.js"
import { signalObjectCreate } from "./signalObjectCreate.js"

type SessionSettledCacheViewStateOptions = {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  isOnline: () => boolean
  sessionId: () => string | null
  /** Signed-in application user, or null while signed out. */
  userId: () => string | null
}

/**
 * Bridges the device-local settled-session cache into the selected-session view.
 * The cached record renders immediately, an online visit revalidates it with the
 * stored ETag, and the account is pinned to the signed-in user or, while signed
 * out, to the last locally active account only.
 */
export function sessionSettledCacheViewStateCreate(options: SessionSettledCacheViewStateOptions) {
  const record = signalObjectCreate<SessionSettledRecord | undefined>(undefined)
  const status = signalObjectCreate<SessionSettledCacheStatus>("loading")
  let cache: ReturnType<typeof sessionSettledCacheStateCreate> | undefined
  let databaseOpen: ReturnType<typeof sessionSettledDatabaseOpen> | undefined

  const databaseResolve = () => {
    databaseOpen ??= sessionSettledDatabaseOpen(sessionSettledCacheDatabaseConfig)
    return databaseOpen
  }

  createEffect(() => {
    const signedInUserId = options.userId()
    if (signedInUserId !== null) sessionLastActiveAccountWrite(signedInUserId)
  })

  createEffect(() => {
    const sessionId = options.sessionId()
    const userId = options.userId()
    let disposed = false
    onCleanup(() => {
      disposed = true
    })

    cache = undefined
    record.set(undefined)
    status.set("loading")
    if (sessionId === null) {
      status.set("ready")
      return
    }

    void (async () => {
      const opened = await databaseResolve()
      if (disposed) return
      if (!opened.success) {
        status.set("error")
        return
      }

      const created = sessionSettledCacheStateCreate({
        database: opened.data,
        ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
        isOnline: options.isOnline,
        lastLocallyActiveUserId: sessionLastActiveAccountRead(),
        sessionId,
        userId,
      })
      cache = created

      const loaded = await created.load()
      if (disposed || cache !== created) return
      if (loaded.success) record.set(created.state().record)
      status.set(created.state().status)

      await created.ready
      if (disposed || cache !== created) return
      record.set(created.state().record)
      status.set(created.state().status)
    })()
  })

  const revalidate = async () => {
    const current = cache
    if (current === undefined) return
    status.set("revalidating")
    await current.revalidate()
    if (cache !== current) return
    record.set(current.state().record)
    status.set(current.state().status)
  }

  return {
    completionReconcile: async (snapshot: unknown) => {
      const current = cache
      if (current === undefined) return
      const reconciled = await current.completionReconcile(snapshot)
      if (!reconciled.success || cache !== current) return
      record.set(current.state().record)
      status.set(current.state().status)
    },
    record: record.get,
    revalidate: () => void revalidate(),
    status: status.get,
  }
}

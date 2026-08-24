import { useContext } from "solid-js"
import { applicationAccountContext } from "../../ui/applicationAccountContext.js"
import { appShellContext } from "../../ui/appShellContext.js"
import { httpQueryAccountCacheCreate } from "../../ui/httpQueryAccountCacheCreate.js"
import { httpQueryStateCreate } from "../../ui/httpQueryStateCreate.js"
import type { NoteListResponse } from "../api/noteListResponseSchema.js"
import { noteListConditionalFetch } from "../client/noteListConditionalFetch.js"

type NoteListQueryStateOptions = {
  /** Scopes the shared revision/ETag cache; defaults to the signed-in application user. */
  accountId?: () => string | null
  fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  isOnline?: () => boolean
}

/**
 * One account-scoped note-list read shared by the notes index and the workspace
 * sidebar. Both screens resolve the same cache key, so a retained list stays
 * rendered while the other screen revalidates it conditionally.
 */
export function noteListQueryStateCreate(options: NoteListQueryStateOptions) {
  const account = useContext(applicationAccountContext)
  const shell = useContext(appShellContext)
  const accountCache = httpQueryAccountCacheCreate(() => options.accountId?.() ?? account?.userId() ?? null)
  const isOnline = options.isOnline ?? (() => shell === undefined || shell.pwa.status() !== "offline")
  const query = httpQueryStateCreate<NoteListResponse>({
    cache: accountCache.cache,
    key: () => accountCache.keyCreate("/api/notes"),
    load: (_key, signal, cached) =>
      noteListConditionalFetch({
        fetch: options.fetcher,
        signal,
        ...(cached?.etag === undefined ? {} : { etag: cached.etag }),
      }),
  })

  return { isOnline, notes: () => query.data() ?? [], query }
}

import * as solidRuntime from "solid-js/dist/solid.js"
import { apiHttpClientCreate } from "../api/client/apiHttpClientCreate.js"
import type { ProjectRegistryState } from "../project/ui/projectRegistryState.js"
import type { SessionShell } from "../session/api/sessionShellSchema.js"
import { sessionListPageLoad } from "../session/client/sessionListPageLoad.js"
import { commandMenuItemsCreate } from "./commandMenuItemsCreate.js"

const { createEffect, createSignal, onCleanup } = solidRuntime as unknown as Pick<
  typeof import("solid-js"),
  "createEffect" | "createSignal" | "onCleanup"
>

const sessionPageLimit = 50

export function commandMenuStateCreate(options: {
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  projectRegistry: ProjectRegistryState
}) {
  const fetcher = options.fetcher ?? fetch
  const client = apiHttpClientCreate({ fetch: fetcher })
  const [query, setQuery] = createSignal("")
  const [sessions, setSessions] = createSignal<SessionShell[]>([])
  const [sessionStatus, setSessionStatus] = createSignal<"idle" | "loading" | "complete" | "error">("idle")
  const [nextCursor, setNextCursor] = createSignal<string | null>(null)
  let sessionController: AbortController | undefined
  let requestVersion = 0

  const pageLoad = async (search: string, cursor?: string, append = false) => {
    const version = requestVersion
    const controller = sessionController
    if (controller === undefined) return
    const result = await sessionListPageLoad(client, {
      coalesce: false,
      cursor,
      limit: sessionPageLimit,
      search,
      signal: controller.signal,
    })
    if (controller.signal.aborted || version !== requestVersion) return
    if (!result.success) {
      if (!append) setSessions([])
      setSessionStatus("error")
      return
    }
    setSessions((current) => {
      if (!append) return result.data.sessions
      const known = new Set(current.map((session) => session.id))
      return [...current, ...result.data.sessions.filter((session) => !known.has(session.id))]
    })
    setNextCursor(result.data.nextCursor)
    setSessionStatus("complete")
  }

  createEffect(() => {
    const search = query().trim()
    requestVersion += 1
    sessionController?.abort()
    sessionController = undefined
    setSessions([])
    setNextCursor(null)
    if (search === "") {
      setSessionStatus("idle")
      return
    }
    sessionController = new AbortController()
    setSessionStatus("loading")
    void pageLoad(search)
  })

  onCleanup(() => {
    requestVersion += 1
    sessionController?.abort()
  })

  return {
    items: () =>
      commandMenuItemsCreate({
        projects: options.projectRegistry.availableProjects(),
        query: query(),
        sessions: sessions(),
      }),
    isLoadingProjects: () => options.projectRegistry.status() === "loading",
    isProjectError: () => options.projectRegistry.status() === "error",
    isLoadingSessions: () => sessionStatus() === "loading",
    isSessionError: () => sessionStatus() === "error",
    hasMoreSessions: () => nextCursor() !== null,
    loadMoreSessions: () => {
      const cursor = nextCursor()
      if (cursor === null || sessionStatus() === "loading" || sessionController === undefined) return
      setSessionStatus("loading")
      void pageLoad(query().trim(), cursor, true)
    },
    query: query,
    querySet: setQuery,
  }
}

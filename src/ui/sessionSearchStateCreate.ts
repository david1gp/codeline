import type { Accessor } from "solid-js"
import * as solidRuntime from "solid-js/dist/solid.js"
import * as v from "valibot"
import { apiHttpClientCreate } from "../api/client/apiHttpClientCreate.js"
import { sessionListPageLoad } from "../session/client/sessionListPageLoad.js"
import type { SessionSearchResponse } from "../session/schema/sessionSearchResponseSchema.js"

const { createEffect, createSignal, onCleanup } = solidRuntime as unknown as Pick<
  typeof import("solid-js"),
  "createEffect" | "createSignal" | "onCleanup"
>

const searchSchema = v.pipe(v.string(), v.trim(), v.maxLength(100))
const sessionSearchLimit = 100

type SearchNavigation = {
  location: Pick<Location, "href">
  history: Pick<History, "replaceState">
  addEventListener?: (type: "popstate", listener: () => void) => void
  removeEventListener?: (type: "popstate", listener: () => void) => void
}

type SessionSearchStateOptions = {
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

function searchResolve(navigation: SearchNavigation): string {
  const value = new URL(navigation.location.href).searchParams.get("search") ?? ""
  const result = v.safeParse(searchSchema, value)
  return result.success ? result.output : ""
}

export function sessionSearchStateCreate(
  navigation: Accessor<SearchNavigation> | SearchNavigation = window,
  options: SessionSearchStateOptions = {},
) {
  const getNavigation = typeof navigation === "function" ? navigation : () => navigation
  const [query, setQuery] = createSignal(searchResolve(getNavigation()))
  const [sessions, setSessions] = createSignal<SessionSearchResponse["sessions"]>([])
  const [status, setStatus] = createSignal<"idle" | "loading" | "complete" | "error">("idle")
  const [retryVersion, setRetryVersion] = createSignal(0)
  const client = apiHttpClientCreate({ fetch: options.fetcher ?? fetch })
  let requestVersion = 0
  let abortController: AbortController | undefined

  const updateUrl = (value: string) => {
    const result = v.safeParse(searchSchema, value)
    if (!result.success) return
    const url = new URL(getNavigation().location.href)
    if (result.output === "") url.searchParams.delete("search")
    else url.searchParams.set("search", result.output)
    getNavigation().history.replaceState(null, "", url)
    setQuery(result.output)
  }

  const handlePopstate = () => setQuery(searchResolve(getNavigation()))
  const revalidate = () => setRetryVersion((version) => version + 1)

  createEffect(() => {
    const value = query()
    retryVersion()
    const currentVersion = ++requestVersion
    abortController?.abort()
    abortController = undefined

    if (value === "") {
      setSessions([])
      setStatus("idle")
      return
    }

    const controller = new AbortController()
    abortController = controller
    setStatus("loading")

    void sessionListPageLoad(client, {
      limit: sessionSearchLimit,
      search: value,
      signal: controller.signal,
    }).then((result) => {
      if (controller.signal.aborted || currentVersion !== requestVersion) return
      if (!result.success) {
        setSessions([])
        setStatus("error")
        return
      }
      setSessions(result.data.sessions.map((session) => ({ session })))
      setStatus("complete")
    })
  })

  getNavigation().addEventListener?.("popstate", handlePopstate)
  onCleanup(() => abortController?.abort())
  onCleanup(() => getNavigation().removeEventListener?.("popstate", handlePopstate))

  return {
    query,
    sessions,
    isActive: () => query().length > 0,
    isLoading: () => status() === "loading",
    isError: () => status() === "error",
    isComplete: () => status() === "complete",
    refresh: revalidate,
    revalidate,
    retry: revalidate,
    updateQuery: updateUrl,
  }
}

export type SessionSearchState = ReturnType<typeof sessionSearchStateCreate>

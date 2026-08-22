import { makeFunctionReference } from "convex/server"
import type { Accessor } from "solid-js"
import { onCleanup as solidOnCleanup, useContext } from "solid-js"
import * as solidRuntime from "solid-js/dist/solid.js"
import * as v from "valibot"
import { codelineConvexQueryCreate } from "../convex/codelineConvexQueryCreate.js"
import { convexContext } from "../convex/convexContext.js"
import type { SessionListResult } from "../session/convex/sessionListResult.js"
import type { SessionSearchResponse } from "../session/schema/sessionSearchResponseSchema.js"
import { sessionSearchResponseSchema } from "../session/schema/sessionSearchResponseSchema.js"

const { createEffect, createSignal, onCleanup } = solidRuntime as unknown as Pick<
  typeof import("solid-js"),
  "createEffect" | "createSignal" | "onCleanup"
>

const searchSchema = v.pipe(v.string(), v.trim(), v.maxLength(100))
const sessionSearchReference = makeFunctionReference<
  "query",
  Record<string, unknown>,
  import("@adaptive-ds/result").Result<SessionListResult>
>("sessions:sessionSearch")

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
  if (useContext(convexContext) !== undefined) return sessionSearchStateCreateConvex(navigation)
  return sessionSearchStateCreateZero(navigation, options)
}

function sessionSearchStateCreateConvex(navigation: Accessor<SearchNavigation> | SearchNavigation) {
  const convex = useContext(convexContext)
  const getNavigation = typeof navigation === "function" ? navigation : () => navigation
  const [query, setQuery] = createSignal(searchResolve(getNavigation()))
  const convexQuery = codelineConvexQueryCreate<SessionListResult>(
    sessionSearchReference,
    () => ({
      includeArchived: false,
      limit: 100,
      search: query(),
      organizationId: convex?.organizationId ?? "",
    }),
    { enabled: () => query().length > 0 && convex?.organizationId !== undefined, keepData: true },
  )

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
  solidOnCleanup(() => getNavigation().removeEventListener?.("popstate", handlePopstate))
  getNavigation().addEventListener?.("popstate", handlePopstate)

  return {
    query,
    sessions: () => convexQuery.data()?.rows.map((row) => ({ session: row.session })) ?? [],
    isActive: () => query().length > 0,
    isLoading: () => query().length > 0 && convexQuery.isLoading(),
    isError: () => query().length > 0 && convexQuery.isError(),
    isComplete: () => query().length > 0 && convexQuery.isComplete(),
    retry: () => {
      convexQuery.retry()
    },
    updateQuery: updateUrl,
  }
}

function sessionSearchStateCreateZero(
  navigation: Accessor<SearchNavigation> | SearchNavigation,
  options: SessionSearchStateOptions,
) {
  const getNavigation = typeof navigation === "function" ? navigation : () => navigation
  const [query, setQuery] = createSignal(searchResolve(getNavigation()))
  const [sessions, setSessions] = createSignal<SessionSearchResponse["sessions"]>([])
  const [status, setStatus] = createSignal<"idle" | "loading" | "complete" | "error">("idle")
  const [retryVersion, setRetryVersion] = createSignal(0)
  const fetcher = options.fetcher ?? fetch
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

    void fetcher(`/api/sessions?search=${encodeURIComponent(value)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("The session search failed.")
        const parsed = v.safeParse(sessionSearchResponseSchema, await response.json())
        if (!parsed.success) throw new Error("The session search response is invalid.")
        if (currentVersion !== requestVersion) return
        setSessions(parsed.output.sessions)
        setStatus("complete")
      })
      .catch((_error: unknown) => {
        if (controller.signal.aborted || currentVersion !== requestVersion) return
        setSessions([])
        setStatus("error")
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
    retry: () => setRetryVersion((version) => version + 1),
    updateQuery: updateUrl,
  }
}

export type SessionSearchState = ReturnType<typeof sessionSearchStateCreate>

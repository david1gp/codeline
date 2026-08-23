import { createEffect, createSignal, onCleanup } from "solid-js/dist/solid.js"
import * as v from "valibot"
import type { ProjectApiListResponse } from "../../project/api/projectApiListResponseSchema.js"
import { projectApiListResponseSchema } from "../../project/api/projectApiListResponseSchema.js"

type NoteProjectListStateOptions = {
  apiBase?: string
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

function createSignalObject<T>(value: T) {
  const [get, set] = createSignal(value)
  return { get, set }
}

export function noteProjectListStateCreate(options: NoteProjectListStateOptions = {}) {
  const apiBase = options.apiBase ?? "/api/project"
  const fetcher = options.fetcher ?? fetch
  const projects = createSignalObject<ProjectApiListResponse["projects"]>([])
  const [refreshVersion, setRefreshVersion] = createSignal(0)
  let controller: AbortController | undefined

  createEffect(() => {
    refreshVersion()
    controller?.abort()
    const active = new AbortController()
    controller = active
    void fetcher(`${apiBase}/list`, { signal: active.signal })
      .then(async (response) => {
        if (!response.ok) return
        const parsed = v.safeParse(projectApiListResponseSchema, await response.json())
        if (!parsed.success || active.signal.aborted) return
        projects.set(parsed.output.projects)
      })
      .catch((_error: unknown) => {
        if (!active.signal.aborted) return
      })
  })

  const revalidate = () => setRefreshVersion((version) => version + 1)

  onCleanup(() => controller?.abort())

  return { projects: projects.get, refresh: revalidate, revalidate }
}

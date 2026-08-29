import type { Result } from "@adaptive-ds/result"
import type { Accessor } from "solid-js"
import { httpQueryAccountCacheCreate } from "../../ui/httpQueryAccountCacheCreate.js"
import { httpQueryStateCreate } from "../../ui/httpQueryStateCreate.js"
import type { ProjectRegistryApiListResponse } from "../api/projectRegistryApiListResponseSchema.js"
import type { ProjectRegistryApiProjectResponse } from "../api/projectRegistryApiProjectResponseSchema.js"
import type { ProjectRegistryApiProject } from "../api/projectRegistryApiProjectSchema.js"
import type { ProjectRegistryOpenCodeImportResponse } from "../api/projectRegistryOpenCodeImportResponseSchema.js"
import type { ProjectRegistryRegisterRequest } from "../api/projectRegistryRegisterRequestSchema.js"
import type { ProjectRegistryRenameRequest } from "../api/projectRegistryRenameRequestSchema.js"
import { projectRegistryListFetch } from "../client/projectRegistryListFetch.js"
import { projectRegistryOpenCodeImportRequest } from "../client/projectRegistryOpenCodeImportRequest.js"
import { projectRegistryRegisterRequest } from "../client/projectRegistryRegisterRequest.js"
import { projectRegistryRemoveRequest } from "../client/projectRegistryRemoveRequest.js"
import { projectRegistryRenameRequest } from "../client/projectRegistryRenameRequest.js"

type ProjectRegistryStateOptions = {
  accountId?: Accessor<string | null>
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  isOnline?: Accessor<boolean>
}

export function projectRegistryStateCreate(options: ProjectRegistryStateOptions = {}) {
  const fetchImplementation = options.fetch ?? globalThis.fetch
  const accountCache = httpQueryAccountCacheCreate(() => options.accountId?.() ?? null)

  const query = httpQueryStateCreate<ProjectRegistryApiListResponse>({
    cache: accountCache.cache,
    enabled: () => options.isOnline?.() ?? true,
    key: () => accountCache.keyCreate("/api/project/registry"),
    load: async (_key, signal) => projectRegistryListFetch({ fetch: fetchImplementation, signal }),
  })

  const projects = (): readonly ProjectRegistryApiProject[] => query.data()?.projects ?? []
  const availableProjects = (): readonly ProjectRegistryApiProject[] =>
    projects().filter((project) => project.available)
  const projectFind = (projectId: string): ProjectRegistryApiProject | undefined =>
    projects().find((project) => project.id === projectId)

  const status = (): "loading" | "ready" | "empty" | "error" => {
    if (query.isError()) return "error"
    if (query.isLoading() && query.data() === undefined) return "loading"
    if (projects().length === 0) return "empty"
    return "ready"
  }

  const openCodeImport = async (): Promise<Result<ProjectRegistryOpenCodeImportResponse>> => {
    const result = await projectRegistryOpenCodeImportRequest({ fetch: fetchImplementation })
    if (result.success) {
      query.refresh()
    }
    return result
  }

  const projectRegister = async (
    input: ProjectRegistryRegisterRequest,
  ): Promise<Result<ProjectRegistryApiProjectResponse>> => {
    const result = await projectRegistryRegisterRequest(input, { fetch: fetchImplementation })
    if (result.success) {
      query.refresh()
    }
    return result
  }

  const projectRename = async (
    projectId: string,
    input: ProjectRegistryRenameRequest,
  ): Promise<Result<ProjectRegistryApiProjectResponse>> => {
    const result = await projectRegistryRenameRequest(projectId, input, { fetch: fetchImplementation })
    if (result.success) {
      query.refresh()
    }
    return result
  }

  const projectRemove = async (projectId: string): Promise<Result<undefined>> => {
    const result = await projectRegistryRemoveRequest(projectId, { fetch: fetchImplementation })
    if (result.success) {
      query.refresh()
    }
    return result
  }

  return {
    availableProjects,
    errorMessage: query.errorMessage,
    isEmpty: () => status() === "empty",
    isError: query.isError,
    isLoading: query.isLoading,
    openCodeImport,
    projectFind,
    projectOpenCodeImport: openCodeImport,
    projectRegister,
    projectRemove,
    projectRename,
    projects,
    refresh: () => {
      query.refresh()
    },
    retry: () => {
      query.retry()
    },
    status,
  }
}

export type ProjectRegistryState = ReturnType<typeof projectRegistryStateCreate>

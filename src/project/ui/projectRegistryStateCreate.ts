import type { Result } from "@adaptive-ds/result"
import { onCleanup } from "solid-js"
import type { Accessor } from "solid-js"
import { httpQueryAccountCacheCreate } from "../../ui/httpQueryAccountCacheCreate.js"
import { httpQueryStateCreate } from "../../ui/httpQueryStateCreate.js"
import type { ProjectRegistryApiFolderResponse } from "../api/projectRegistryApiFolderResponseSchema.js"
import type { ProjectRegistryApiFolder } from "../api/projectRegistryApiFolderSchema.js"
import type { ProjectRegistryApiListResponse } from "../api/projectRegistryApiListResponseSchema.js"
import type { ProjectRegistryApiProjectResponse } from "../api/projectRegistryApiProjectResponseSchema.js"
import type { ProjectRegistryApiProject } from "../api/projectRegistryApiProjectSchema.js"
import type { ProjectRegistryFolderRequest } from "../api/projectRegistryFolderRequestSchema.js"
import type { ProjectRegistryMoveRequest } from "../api/projectRegistryMoveRequestSchema.js"
import type { ProjectRegistryOpenCodeImportResponse } from "../api/projectRegistryOpenCodeImportResponseSchema.js"
import type { ProjectRegistryRegisterRequest } from "../api/projectRegistryRegisterRequestSchema.js"
import type { ProjectRegistryRenameRequest } from "../api/projectRegistryRenameRequestSchema.js"
import { projectRegistryFolderCreateRequest } from "../client/projectRegistryFolderCreateRequest.js"
import { projectRegistryFolderRemoveRequest } from "../client/projectRegistryFolderRemoveRequest.js"
import { projectRegistryFolderRenameRequest } from "../client/projectRegistryFolderRenameRequest.js"
import { projectRegistryListFetch } from "../client/projectRegistryListFetch.js"
import { projectRegistryMoveRequest } from "../client/projectRegistryMoveRequest.js"
import { projectRegistryOpenCodeImportRequest } from "../client/projectRegistryOpenCodeImportRequest.js"
import { projectRegistryRegisterRequest } from "../client/projectRegistryRegisterRequest.js"
import { projectRegistryRemoveRequest } from "../client/projectRegistryRemoveRequest.js"
import { projectRegistryRenameRequest } from "../client/projectRegistryRenameRequest.js"

type ProjectRegistryStateOptions = {
  accountId?: Accessor<string | null>
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  isOnline?: Accessor<boolean>
  scheduler?: ProjectRegistryStateScheduler
}

type ProjectRegistryStateScheduler = {
  clearInterval: (handle: unknown) => void
  setInterval: (handler: () => void, timeoutMs: number) => unknown
}

const projectRegistryRefreshIntervalMs = 24 * 60 * 60 * 1000

export function projectRegistryStateCreate(options: ProjectRegistryStateOptions = {}) {
  const fetchImplementation = options.fetch ?? globalThis.fetch
  const accountCache = httpQueryAccountCacheCreate(() => options.accountId?.() ?? null)

  const query = httpQueryStateCreate<ProjectRegistryApiListResponse>({
    cache: accountCache.cache,
    enabled: () => options.isOnline?.() ?? true,
    key: () => accountCache.keyCreate("/api/project/registry"),
    load: async (_key, signal) => projectRegistryListFetch({ fetch: fetchImplementation, signal }),
  })
  const scheduler: ProjectRegistryStateScheduler = options.scheduler ?? {
    clearInterval: (handle) => globalThis.clearInterval(handle as ReturnType<typeof globalThis.setInterval>),
    setInterval: (handler, timeoutMs) => globalThis.setInterval(handler, timeoutMs),
  }
  const refreshTimer = scheduler.setInterval(() => query.refresh(), projectRegistryRefreshIntervalMs)
  onCleanup(() => scheduler.clearInterval(refreshTimer))

  const projects = (): readonly ProjectRegistryApiProject[] => query.data()?.projects ?? []
  const folders = (): readonly ProjectRegistryApiFolder[] => query.data()?.folders ?? []
  const availableProjects = (): readonly ProjectRegistryApiProject[] =>
    projects().filter((project) => project.available)
  const folderFind = (folderId: string): ProjectRegistryApiFolder | undefined =>
    folders().find((folder) => folder.id === folderId)
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

  const folderCreate = async (
    input: ProjectRegistryFolderRequest,
  ): Promise<Result<ProjectRegistryApiFolderResponse>> => {
    const result = await projectRegistryFolderCreateRequest(input, { fetch: fetchImplementation })
    if (result.success) query.refresh()
    return result
  }

  const folderRename = async (
    folderId: string,
    input: ProjectRegistryFolderRequest,
  ): Promise<Result<ProjectRegistryApiFolderResponse>> => {
    const result = await projectRegistryFolderRenameRequest(folderId, input, { fetch: fetchImplementation })
    if (result.success) query.refresh()
    return result
  }

  const folderRemove = async (folderId: string): Promise<Result<undefined>> => {
    const result = await projectRegistryFolderRemoveRequest(folderId, { fetch: fetchImplementation })
    if (result.success) query.refresh()
    return result
  }

  const projectMove = async (
    projectId: string,
    input: ProjectRegistryMoveRequest,
  ): Promise<Result<ProjectRegistryApiProjectResponse>> => {
    const result = await projectRegistryMoveRequest(projectId, input, { fetch: fetchImplementation })
    if (result.success) query.refresh()
    return result
  }

  return {
    availableProjects,
    errorMessage: query.errorMessage,
    folderCreate,
    folderFind,
    folderRemove,
    folderRename,
    folders,
    isEmpty: () => status() === "empty",
    isError: query.isError,
    isLoading: query.isLoading,
    openCodeImport,
    projectFind,
    projectOpenCodeImport: openCodeImport,
    projectRegister,
    projectRemove,
    projectMove,
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

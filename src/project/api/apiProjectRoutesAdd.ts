import * as path from "node:path"
import { Readable } from "node:stream"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { Context } from "hono"
import { Hono } from "hono"
import * as v from "valibot"
import { apiRequestParse } from "../../api/apiRequestParse.js"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import type { ApiErrorResponse } from "../../api/errors/apiErrorResponseSchema.js"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { projectFolderRepositoryCreate } from "../db/projectFolderRepositoryCreate.js"
import { projectFolderRepositoryDelete } from "../db/projectFolderRepositoryDelete.js"
import { projectFolderRepositoryList } from "../db/projectFolderRepositoryList.js"
import { projectFolderRepositoryUpdate } from "../db/projectFolderRepositoryUpdate.js"
import { projectFolderResolve } from "../db/projectFolderResolve.js"
import type { ProjectFolderStatus } from "../db/projectFolderStatus.js"
import { projectFolderStatusList } from "../db/projectFolderStatusList.js"
import { projectRegistryRepositoryDelete } from "../db/projectRegistryRepositoryDelete.js"
import { projectRegistryRepositoryList } from "../db/projectRegistryRepositoryList.js"
import { projectRegistryRepositoryMove } from "../db/projectRegistryRepositoryMove.js"
import { projectRegistryRepositoryResolve } from "../db/projectRegistryRepositoryResolve.js"
import { projectRegistryRepositoryResolvePath } from "../db/projectRegistryRepositoryResolvePath.js"
import { projectRegistryRepositoryUpdate } from "../db/projectRegistryRepositoryUpdate.js"
import { projectRegistryRepositoryUpsert } from "../db/projectRegistryRepositoryUpsert.js"
import { projectDirectoryConfirm } from "../projectDirectoryConfirm.js"
import { projectDirectoryList } from "../projectDirectoryList.js"
import { projectDirectorySuggestionsRead } from "../projectDirectorySuggestionsRead.js"
import { type ProjectDiscoveryEntriesReadResult, projectDiscoveryEntriesRead } from "../projectDiscoveryEntriesRead.js"
import { projectDiscoveryLimits } from "../projectDiscoveryLimits.js"
import { projectDiscoveryList } from "../projectDiscoveryList.js"
import { projectDownloadPrepare } from "../projectDownloadPrepare.js"
import { projectFolderIdSchema } from "../projectFolderIdSchema.js"
import { projectGitBranchDelete } from "../projectGitBranchDelete.js"
import { projectGitBranchListRead } from "../projectGitBranchListRead.js"
import { projectGitBranchNameSchema } from "../projectGitBranchNameSchema.js"
import { projectGitBranchRename } from "../projectGitBranchRename.js"
import { projectGitBranchSwitch } from "../projectGitBranchSwitch.js"
import { projectGitDiffSummaryRead } from "../projectGitDiffSummaryRead.js"
import { projectGitStatusRead } from "../projectGitStatusRead.js"
import { projectIdentityResolve } from "../projectIdentityResolve.js"
import type { ProjectLimits } from "../projectLimitsSchema.js"
import { projectMetadataRead } from "../projectMetadataRead.js"
import { projectPreviewPrepare } from "../projectPreviewPrepare.js"
import { projectPreviewRead } from "../projectPreviewRead.js"
import { projectRegistryOpenCodeImport } from "../projectRegistryOpenCodeImport.js"
import { projectRegistryPathCanonicalize } from "../projectRegistryPathCanonicalize.js"
import { projectResolve } from "../projectResolve.js"
import { projectTextRead } from "../projectTextRead.js"
import { projectApiDirectoryConfirmRequestSchema } from "./projectApiDirectoryConfirmRequestSchema.js"
import type { ProjectApiDirectoryConfirmResponse } from "./projectApiDirectoryConfirmResponseSchema.js"
import type { ProjectApiDirectoryResponse } from "./projectApiDirectoryResponseSchema.js"
import { projectApiDirectorySuggestionsQuerySchema } from "./projectApiDirectorySuggestionsQuerySchema.js"
import type { ProjectApiDirectorySuggestionsResponse } from "./projectApiDirectorySuggestionsResponseSchema.js"
import { projectApiIdentityQuerySchema } from "./projectApiIdentityQuerySchema.js"
import type { ProjectApiIdentityResponse } from "./projectApiIdentityResponseSchema.js"
import type { ProjectApiListResponse } from "./projectApiListResponseSchema.js"
import type { ProjectApiMetadataResponse } from "./projectApiMetadataResponseSchema.js"
import { projectApiPathQuerySchema } from "./projectApiPathQuerySchema.js"
import type { ProjectApiPreviewResponse } from "./projectApiPreviewResponseSchema.js"
import { projectApiProjectQuerySchema } from "./projectApiProjectQuerySchema.js"
import type { ProjectApiTextResponse } from "./projectApiTextResponseSchema.js"
import { projectDiscoveryApiProjectQuerySchema } from "./projectDiscoveryApiProjectQuerySchema.js"
import type { ProjectRegistryApiFolder } from "./projectRegistryApiFolderSchema.js"
import {
  type ProjectRegistryApiListResponse,
  projectRegistryApiListResponseSchema,
} from "./projectRegistryApiListResponseSchema.js"
import type { ProjectRegistryApiProjectResponse } from "./projectRegistryApiProjectResponseSchema.js"
import type { ProjectRegistryApiProject } from "./projectRegistryApiProjectSchema.js"
import { projectRegistryFolderRequestSchema } from "./projectRegistryFolderRequestSchema.js"
import {
  type ProjectRegistryOpenCodeImportResponse,
  projectRegistryOpenCodeImportResponseSchema,
} from "./projectRegistryOpenCodeImportResponseSchema.js"
import { projectRegistryRegisterRequestSchema } from "./projectRegistryRegisterRequestSchema.js"
import { projectRegistryRenameRequestSchema } from "./projectRegistryRenameRequestSchema.js"

type ApiContext = Context<AppEnvironment>

type ApiProjectRoutesOptions = {
  database?: DatabaseClient
  discoveryEntriesRead?: typeof projectDiscoveryEntriesRead
  limits?: ProjectLimits
  openCodeDatabasePath?: string
  rootDirs?: readonly string[]
}

function errorResponse(context: ApiContext, errorMessage: string) {
  const isRootError = errorMessage.includes("Repository root")
  const notFound = !isRootError && errorMessage.includes("does not exist")
  const response = {
    error: {
      code: isRootError ? "internal_server_error" : notFound ? "not_found" : "bad_request",
      message: isRootError
        ? "The project filesystem is unavailable."
        : notFound
          ? "The project path was not found."
          : "The project path is invalid or inaccessible.",
    },
  } satisfies ApiErrorResponse

  return context.json(response, response.error.code === "internal_server_error" ? 500 : notFound ? 404 : 400)
}

function unauthorized(context: ApiContext) {
  const response = {
    error: { code: "unauthorized", message: "Authentication is required." },
  } satisfies ApiErrorResponse
  context.header("Cache-Control", "no-store")
  return context.json(response, 401)
}

function requestUserId(context: ApiContext): string | undefined {
  const userId = context.get("requestIdentity")?.userId
  return typeof userId === "string" && userId.length > 0 ? userId : undefined
}

function registryRequestUserId(context: ApiContext, options: ApiProjectRoutesOptions): string | undefined {
  if (options.database === undefined) return undefined
  return requestUserId(context)
}

function registryUnavailable(context: ApiContext) {
  const response = {
    error: { code: "not_found", message: "The requested project was not found." },
  } satisfies ApiErrorResponse
  return context.json(response, 404)
}

function registryInternalServerError(context: ApiContext) {
  const response = {
    error: { code: "internal_server_error", message: "The project registry request could not be completed." },
  } satisfies ApiErrorResponse
  return context.json(response, 500)
}

function registryBadRequest(context: ApiContext, message = "The project registry request is invalid.") {
  const response = { error: { code: "bad_request", message } } satisfies ApiErrorResponse
  return context.json(response, 400)
}

function registryConflict(context: ApiContext, message: string) {
  const response = { error: { code: "conflict", message } } satisfies ApiErrorResponse
  return context.json(response, 409)
}

function projectRegistryLabelCreate(displayName: string | null, projectPath: string): string {
  const value = displayName?.trim() || projectPath.split(/[\\/]/).at(-1) || projectPath
  return [...value].slice(0, projectDiscoveryLimits.maximumLabelLength).join("")
}

type ProjectRegistryStatus = Pick<ProjectFolderStatus, "active" | "unseenEnded">

type ProjectRegistryParentFolder = { id: string; label: string } | null

async function projectRegistryApiProjectCreate(
  project: { displayName: string | null; id: string; parentFolderId: string | null; path: string },
  rootDirs: readonly string[],
  parentFolder: ProjectRegistryParentFolder,
  status: ProjectRegistryStatus = { active: false, unseenEnded: false },
): Promise<ProjectRegistryApiProject> {
  const available = (await projectRegistryPathCanonicalize(project.path, rootDirs)).success
  return {
    active: status.active,
    available,
    folderId: project.parentFolderId,
    id: project.id,
    label: projectRegistryLabelCreate(project.displayName, project.path),
    parentFolder,
    unseenEnded: status.unseenEnded,
  }
}

function projectRegistryParentFolderFind(
  folders: readonly { id: string; name: string }[],
  parentFolderId: string | null,
): ProjectRegistryParentFolder {
  if (parentFolderId === null) return null
  const folder = folders.find((candidate) => candidate.id === parentFolderId)
  return folder === undefined ? null : { id: folder.id, label: folder.name }
}

function projectRegistryStatusMapCreate(statuses: readonly ProjectFolderStatus[]): Map<string, ProjectRegistryStatus> {
  return new Map(statuses.map((status) => [status.projectId, status]))
}

function projectRegistryFolderCreate(
  folder: { id: string; name: string },
  statuses: readonly ProjectFolderStatus[],
): ProjectRegistryApiFolder {
  const projects = statuses.filter((status) => status.folderId === folder.id)
  return {
    active: projects.some((status) => status.active),
    id: folder.id,
    label: folder.name,
    unseenEnded: projects.some((status) => status.unseenEnded),
  }
}

function projectRegistryProjectResponseCreate(project: ProjectRegistryApiProject): ProjectRegistryApiProjectResponse {
  return { project }
}

async function projectRegistryIdentityResolve(
  options: ApiProjectRoutesOptions,
  userId: string,
  projectPath: string,
): Promise<Result<{ id: string; label: string }>> {
  const op = "projectRegistryIdentityResolve"
  if (projectPath === "~" || !path.isAbsolute(projectPath)) {
    return createResultError(op, "The project reference is invalid.")
  }

  const canonical = await projectRegistryPathCanonicalize(projectPath, options.rootDirs ?? [])
  if (!canonical.success) return createResultError(op, "The requested project was not found.")

  if (options.database === undefined) return createResultError(op, "The requested project was not found.")
  const project = await projectRegistryRepositoryResolvePath(options.database, userId, canonical.data)
  if (!project.success || project.data === undefined)
    return createResultError(op, "The requested project was not found.")

  const publicProject = await projectRegistryApiProjectCreate(project.data, options.rootDirs ?? [], null)
  if (!publicProject.available) return createResultError(op, "The requested project was not found.")
  return createResult({ id: publicProject.id, label: publicProject.label })
}

type DiscoveryRead = () => Promise<Result<ProjectDiscoveryEntriesReadResult>>

function queryParse(context: ApiContext) {
  const query = context.req.query()
  const projectId = query.project
  const { project: _project, ...pathQuery } = query
  return {
    parsed: apiRequestParse("projectApiPathQueryParse", projectApiPathQuerySchema, pathQuery),
    projectId,
  }
}

async function projectRootResolve(
  context: ApiContext,
  options: ApiProjectRoutesOptions,
  projectId: unknown,
  discoveryRead: DiscoveryRead,
): Promise<Result<string>> {
  const op = "projectRootResolve"
  const projectQuerySchema =
    options.database === undefined ? projectDiscoveryApiProjectQuerySchema : projectApiProjectQuerySchema
  const parsed = v.safeParse(projectQuerySchema, { project: projectId })
  if (!parsed.success) return createResultError(op, "The project selection is invalid.")

  if (options.database !== undefined) {
    const userId = requestUserId(context)
    if (userId === undefined) return createResultError(op, "Authentication is required.")
    const resolved = await projectResolve(options.rootDirs ?? [], parsed.output.project, {
      database: options.database,
      userId,
    })
    if (!resolved.success) return createResultError(op, "The requested project was not found.")
    return createResult(resolved.data.rootDir)
  }

  const discovered = await discoveryRead()
  if (!discovered.success) return createResultError(op, "The requested project was not found.")
  const resolved = await projectResolve(options.rootDirs ?? [], parsed.output.project, { discovered: discovered.data })
  if (!resolved.success) return createResultError(op, "The requested project was not found.")
  return createResult(resolved.data.rootDir)
}

async function projectGitRootResolve(
  context: ApiContext,
  options: ApiProjectRoutesOptions,
  discoveryRead: DiscoveryRead,
): Promise<Result<string>> {
  const parsed = apiRequestParse(
    "projectApiProjectQueryParse",
    options.database === undefined ? projectDiscoveryApiProjectQuerySchema : projectApiProjectQuerySchema,
    context.req.query(),
  )
  if (!parsed.success) {
    return createResultError("projectRootResolve", "The project selection is invalid.")
  }
  return projectRootResolve(context, options, parsed.data.project, discoveryRead)
}

function projectRootErrorResponse(context: ApiContext, errorMessage: string) {
  // A malformed client reference is a client error. Identity resolution reports it with
  // its own message, so both spellings must map to 400 rather than an internal failure.
  const invalid =
    errorMessage === "The project selection is invalid." || errorMessage === "The project reference is invalid."
  const notFound = errorMessage === "The requested project was not found."
  const response = {
    error: {
      code: invalid ? "bad_request" : notFound ? "not_found" : "internal_server_error",
      message: invalid
        ? "The project selection is invalid."
        : notFound
          ? "The requested project was not found."
          : "The project selection could not be resolved.",
    },
  } satisfies ApiErrorResponse
  return context.json(response, invalid ? 400 : notFound ? 404 : 500)
}

function projectConfiguredRootsResolve(options: ApiProjectRoutesOptions): readonly string[] {
  return options.rootDirs ?? []
}

const projectGitBranchRequestSchema = v.strictObject({ branch: projectGitBranchNameSchema })
const projectGitBranchRenameRequestSchema = v.strictObject({
  branch: projectGitBranchNameSchema,
  newBranch: projectGitBranchNameSchema,
})

function projectGitErrorResponse(context: ApiContext, errorMessage: string, status: 400 | 409 | 500 = 500) {
  const response = {
    error: {
      code: status === 400 ? "bad_request" : status === 409 ? "conflict" : "internal_server_error",
      message:
        status === 409
          ? "Switching branches requires a clean working tree."
          : status === 400
            ? "The Git branch request is invalid."
            : errorMessage.includes("unavailable")
              ? "Project Git is unavailable."
              : "The Git operation failed.",
    },
  } satisfies ApiErrorResponse
  return context.json(response, status)
}

function safeDownloadName(name: string): string {
  const safeName = [...name]
    .map((character) => {
      const code = character.charCodeAt(0)
      return code < 32 || code === 127 || character === '"' || character === "\\" ? "_" : character
    })
    .join("")
  return safeName || "download"
}

function previewContentUrl(context: ApiContext, relativePath: string, projectId?: string): string {
  const requestPath = new URL(context.req.url).pathname
  const routePrefix = requestPath.slice(0, requestPath.lastIndexOf("/project/preview"))
  const projectQuery = projectId === undefined ? "" : `&project=${encodeURIComponent(projectId)}`
  return `${routePrefix}/project/preview/content?path=${encodeURIComponent(relativePath)}${projectQuery}`
}

export function apiProjectRoutesAdd(api: Hono<AppEnvironment>, options: ApiProjectRoutesOptions): void {
  if (options.database !== undefined) {
    api.use("/project/*", async (context, next) => {
      if (requestUserId(context) === undefined) return unauthorized(context)
      return next()
    })
  }

  let cachedDiscovery: Result<ProjectDiscoveryEntriesReadResult> | undefined
  let discoveryPromise: Promise<Result<ProjectDiscoveryEntriesReadResult>> | undefined
  const discoveryEntriesRead = options.discoveryEntriesRead ?? projectDiscoveryEntriesRead
  const discoveryRead: DiscoveryRead = async () => {
    if (cachedDiscovery !== undefined) return cachedDiscovery
    if (discoveryPromise !== undefined) return discoveryPromise

    discoveryPromise = discoveryEntriesRead(options.rootDirs ?? []).then((result) => {
      if (result.success) cachedDiscovery = result
      discoveryPromise = undefined
      return result
    })
    return discoveryPromise
  }
  const discoveryRefresh: DiscoveryRead = async () => {
    cachedDiscovery = undefined
    return discoveryRead()
  }

  const registryFolderStatusesLoad = async (
    context: ApiContext,
    userId: string,
  ): Promise<Result<ProjectFolderStatus[]>> => {
    const organizationId = context.get("requestIdentity")?.organizationId
    if (organizationId === undefined) return createResult([])
    return projectFolderStatusList(options.database as DatabaseClient, userId, organizationId)
  }

  const registryFolderList = async (context: ApiContext) => {
    if (options.database === undefined) return registryInternalServerError(context)
    const userId = registryRequestUserId(context, options)
    if (userId === undefined) return unauthorized(context)

    const folders = await projectFolderRepositoryList(options.database, userId)
    if (!folders.success) return registryInternalServerError(context)
    const statuses = await registryFolderStatusesLoad(context, userId)
    if (!statuses.success) return registryInternalServerError(context)
    return context.json({
      folders: folders.data.map((folder) => projectRegistryFolderCreate(folder, statuses.data)),
    })
  }

  const registryFolderCreate = async (context: ApiContext) => {
    if (options.database === undefined) return registryInternalServerError(context)
    const userId = registryRequestUserId(context, options)
    if (userId === undefined) return unauthorized(context)
    const body = await context.req.json<unknown>().catch(() => undefined)
    const parsed = apiRequestParse("projectRegistryFolderRequestParse", projectRegistryFolderRequestSchema, body)
    if (!parsed.success) return registryBadRequest(context, "The project folder request is invalid.")

    const folder = await projectFolderRepositoryCreate(options.database, userId, parsed.data)
    if (!folder.success) {
      return folder.errorMessage === "The project folder name is already in use."
        ? registryConflict(context, folder.errorMessage)
        : registryInternalServerError(context)
    }
    const statuses = await registryFolderStatusesLoad(context, userId)
    if (!statuses.success) return registryInternalServerError(context)
    return context.json({
      folder: projectRegistryFolderCreate(folder.data, statuses.data),
    })
  }

  const registryFolderIdParse = (context: ApiContext, folderId: string) => {
    const parsed = v.safeParse(projectFolderIdSchema, folderId)
    return parsed.success ? parsed.output : registryBadRequest(context, "The project folder selection is invalid.")
  }

  const registryFolderRename = async (context: ApiContext, folderId: string) => {
    if (options.database === undefined) return registryInternalServerError(context)
    const userId = registryRequestUserId(context, options)
    if (userId === undefined) return unauthorized(context)
    const parsedId = registryFolderIdParse(context, folderId)
    if (parsedId instanceof Response) return parsedId
    const body = await context.req.json<unknown>().catch(() => undefined)
    const parsed = apiRequestParse("projectRegistryFolderRequestParse", projectRegistryFolderRequestSchema, body)
    if (!parsed.success) return registryBadRequest(context, "The project folder request is invalid.")

    const folder = await projectFolderRepositoryUpdate(options.database, userId, parsedId, parsed.data)
    if (!folder.success) {
      return folder.errorMessage === "The project folder name is already in use."
        ? registryConflict(context, folder.errorMessage)
        : registryUnavailable(context)
    }
    const statuses = await registryFolderStatusesLoad(context, userId)
    if (!statuses.success) return registryInternalServerError(context)
    return context.json({
      folder: projectRegistryFolderCreate(folder.data, statuses.data),
    })
  }

  const registryFolderRemove = async (context: ApiContext, folderId: string) => {
    if (options.database === undefined) return registryInternalServerError(context)
    const userId = registryRequestUserId(context, options)
    if (userId === undefined) return unauthorized(context)
    const parsedId = registryFolderIdParse(context, folderId)
    if (parsedId instanceof Response) return parsedId

    const folder = await projectFolderRepositoryDelete(options.database, userId, parsedId)
    if (!folder.success) return registryUnavailable(context)
    return new Response(null, { status: 204 })
  }

  const registryList = async (context: ApiContext) => {
    if (options.database === undefined) return registryInternalServerError(context)
    const userId = registryRequestUserId(context, options)
    if (userId === undefined) return unauthorized(context)

    const result = await projectRegistryRepositoryList(options.database, userId)
    if (!result.success) return registryInternalServerError(context)
    const folders = await projectFolderRepositoryList(options.database, userId)
    if (!folders.success) return registryInternalServerError(context)
    const statuses = await registryFolderStatusesLoad(context, userId)
    if (!statuses.success) return registryInternalServerError(context)
    const statusMap = projectRegistryStatusMapCreate(statuses.data)
    const projects = await Promise.all(
      result.data.map((project) =>
        projectRegistryApiProjectCreate(
          project,
          options.rootDirs ?? [],
          projectRegistryParentFolderFind(folders.data, project.parentFolderId),
          statusMap.get(project.id),
        ),
      ),
    )
    const response = {
      folders: folders.data.map((folder) => projectRegistryFolderCreate(folder, statuses.data)),
      projects,
      truncated: false,
    } satisfies ProjectRegistryApiListResponse
    if (!v.safeParse(projectRegistryApiListResponseSchema, response).success)
      return registryInternalServerError(context)
    return context.json(response)
  }

  const registryRegister = async (context: ApiContext) => {
    if (options.database === undefined) return registryInternalServerError(context)
    const userId = registryRequestUserId(context, options)
    if (userId === undefined) return unauthorized(context)

    const body = await context.req.json<unknown>().catch(() => undefined)
    const parsed = apiRequestParse("projectRegistryRegisterRequestParse", projectRegistryRegisterRequestSchema, body)
    if (!parsed.success) return registryBadRequest(context, "The project registration request is invalid.")

    const canonical = await projectRegistryPathCanonicalize(parsed.data.path, options.rootDirs ?? [])
    if (!canonical.success) return registryBadRequest(context, "The project path is invalid.")
    const result = await projectRegistryRepositoryUpsert(
      options.database,
      userId,
      {
        displayName: parsed.data.displayName,
        path: canonical.data,
      },
      undefined,
      options.rootDirs ?? [],
    )
    if (!result.success) return registryInternalServerError(context)

    const statuses = await registryFolderStatusesLoad(context, userId)
    if (!statuses.success) return registryInternalServerError(context)
    const status = statuses.data.find((entry) => entry.projectId === result.data.id)
    const parentFolder = await projectFolderResolve(options.database, userId, result.data.parentFolderId)
    if (!parentFolder.success) return registryInternalServerError(context)
    const project = await projectRegistryApiProjectCreate(
      result.data,
      options.rootDirs ?? [],
      parentFolder.data,
      status,
    )
    return context.json(projectRegistryProjectResponseCreate(project))
  }

  const registryResolve = async (context: ApiContext, projectId: string) => {
    if (options.database === undefined) return registryInternalServerError(context)
    const userId = registryRequestUserId(context, options)
    if (userId === undefined) return unauthorized(context)
    const parsed = apiRequestParse("projectRegistryProjectQueryParse", projectApiProjectQuerySchema, {
      project: projectId,
    })
    if (!parsed.success) return registryBadRequest(context, "The project selection is invalid.")

    const result = await projectRegistryRepositoryResolve(options.database, userId, parsed.data.project)
    if (!result.success) return registryUnavailable(context)
    const statuses = await registryFolderStatusesLoad(context, userId)
    if (!statuses.success) return registryInternalServerError(context)
    const status = statuses.data.find((entry) => entry.projectId === result.data.id)
    const parentFolder = await projectFolderResolve(options.database, userId, result.data.parentFolderId)
    if (!parentFolder.success) return registryInternalServerError(context)
    const project = await projectRegistryApiProjectCreate(
      result.data,
      options.rootDirs ?? [],
      parentFolder.data,
      status,
    )
    return context.json(projectRegistryProjectResponseCreate(project))
  }

  const registryResolveQuery = async (context: ApiContext) => {
    const parsed = apiRequestParse(
      "projectRegistryProjectQueryParse",
      projectApiProjectQuerySchema,
      context.req.query(),
    )
    if (!parsed.success) return registryBadRequest(context, "The project selection is invalid.")
    return registryResolve(context, parsed.data.project)
  }

  const registryOpenCodeImport = async (context: ApiContext) => {
    if (options.database === undefined) return registryInternalServerError(context)
    const userId = registryRequestUserId(context, options)
    if (userId === undefined) return unauthorized(context)
    if (options.openCodeDatabasePath === undefined) return registryInternalServerError(context)

    const result = await projectRegistryOpenCodeImport(
      options.database,
      userId,
      options.openCodeDatabasePath,
      options.rootDirs ?? [],
    )
    if (!result.success) return registryInternalServerError(context)
    const response = result.data satisfies ProjectRegistryOpenCodeImportResponse
    if (!v.safeParse(projectRegistryOpenCodeImportResponseSchema, response).success)
      return registryInternalServerError(context)
    return context.json(response)
  }

  const registryRename = async (context: ApiContext, projectId: string) => {
    if (options.database === undefined) return registryInternalServerError(context)
    const userId = registryRequestUserId(context, options)
    if (userId === undefined) return unauthorized(context)
    const id = apiRequestParse("projectRegistryProjectQueryParse", projectApiProjectQuerySchema, { project: projectId })
    if (!id.success) return registryBadRequest(context, "The project selection is invalid.")

    const body = await context.req.json<unknown>().catch(() => undefined)
    const parsed = apiRequestParse("projectRegistryRenameRequestParse", projectRegistryRenameRequestSchema, body)
    if (!parsed.success) return registryBadRequest(context, "The project rename request is invalid.")
    const result = await projectRegistryRepositoryUpdate(options.database, userId, id.data.project, parsed.data)
    if (!result.success) return registryUnavailable(context)

    const statuses = await registryFolderStatusesLoad(context, userId)
    if (!statuses.success) return registryInternalServerError(context)
    const status = statuses.data.find((entry) => entry.projectId === result.data.id)
    const parentFolder = await projectFolderResolve(options.database, userId, result.data.parentFolderId)
    if (!parentFolder.success) return registryInternalServerError(context)
    const project = await projectRegistryApiProjectCreate(
      result.data,
      options.rootDirs ?? [],
      parentFolder.data,
      status,
    )
    return context.json(projectRegistryProjectResponseCreate(project))
  }

  const registryMove = async (context: ApiContext, projectId: string) => {
    if (options.database === undefined) return registryInternalServerError(context)
    const userId = registryRequestUserId(context, options)
    if (userId === undefined) return unauthorized(context)
    const id = apiRequestParse("projectRegistryProjectQueryParse", projectApiProjectQuerySchema, { project: projectId })
    if (!id.success) return registryBadRequest(context, "The project selection is invalid.")

    const body = await context.req.json<unknown>().catch(() => undefined)
    const result = await projectRegistryRepositoryMove(options.database, userId, id.data.project, body)
    if (!result.success) {
      return result.errorMessage === "The project folder could not be found."
        ? registryUnavailable(context)
        : result.errorMessage === "The project move input is invalid."
          ? registryBadRequest(context, "The project move request is invalid.")
          : registryUnavailable(context)
    }

    const statuses = await registryFolderStatusesLoad(context, userId)
    if (!statuses.success) return registryInternalServerError(context)
    const status = statuses.data.find((entry) => entry.projectId === result.data.id)
    const parentFolder = await projectFolderResolve(options.database, userId, result.data.parentFolderId)
    if (!parentFolder.success) return registryInternalServerError(context)
    const project = await projectRegistryApiProjectCreate(
      result.data,
      options.rootDirs ?? [],
      parentFolder.data,
      status,
    )
    return context.json(projectRegistryProjectResponseCreate(project))
  }

  const registryRemove = async (context: ApiContext, projectId: string) => {
    if (options.database === undefined) return registryInternalServerError(context)
    const userId = registryRequestUserId(context, options)
    if (userId === undefined) return unauthorized(context)
    const id = apiRequestParse("projectRegistryProjectQueryParse", projectApiProjectQuerySchema, { project: projectId })
    if (!id.success) return registryBadRequest(context, "The project selection is invalid.")

    const result = await projectRegistryRepositoryDelete(options.database, userId, id.data.project)
    if (!result.success) return registryUnavailable(context)
    return new Response(null, { status: 204 })
  }

  api.get("/project/registry", registryList)
  api.get("/project/registry/list", registryList)
  api.get("/project/registry/folders", registryFolderList)
  api.get("/project/registry/folder", registryFolderList)
  api.post("/project/registry", registryRegister)
  api.post("/project/registry/register", registryRegister)
  api.post("/project/registry/folders", registryFolderCreate)
  api.post("/project/registry/folder", registryFolderCreate)
  api.get("/project/registry/resolve", registryResolveQuery)
  api.post("/project/registry/import", registryOpenCodeImport)
  api.patch("/project/registry/folders/:folderId", (context) =>
    registryFolderRename(context, context.req.param("folderId")),
  )
  api.patch("/project/registry/folder/:folderId", (context) =>
    registryFolderRename(context, context.req.param("folderId")),
  )
  api.delete("/project/registry/folders/:folderId", (context) =>
    registryFolderRemove(context, context.req.param("folderId")),
  )
  api.delete("/project/registry/folder/:folderId", (context) =>
    registryFolderRemove(context, context.req.param("folderId")),
  )
  api.patch("/project/registry/rename/:projectId", (context) => registryRename(context, context.req.param("projectId")))
  api.delete("/project/registry/remove/:projectId", (context) =>
    registryRemove(context, context.req.param("projectId")),
  )
  api.get("/project/registry/:projectId", (context) => registryResolve(context, context.req.param("projectId")))
  api.patch("/project/registry/:projectId", (context) => registryRename(context, context.req.param("projectId")))
  api.delete("/project/registry/:projectId", (context) => registryRemove(context, context.req.param("projectId")))
  api.patch("/project/registry/move/:projectId", (context) => registryMove(context, context.req.param("projectId")))
  api.patch("/project/registry/:projectId/folder", (context) => registryMove(context, context.req.param("projectId")))
  api.get("/project/resolve", registryResolveQuery)
  api.post("/project/register", registryRegister)
  api.patch("/project/rename/:projectId", (context) => registryRename(context, context.req.param("projectId")))
  api.delete("/project/remove/:projectId", (context) => registryRemove(context, context.req.param("projectId")))
  api.patch("/project/move/:projectId", (context) => registryMove(context, context.req.param("projectId")))

  api.get("/project/list", async (context) => {
    if (options.database !== undefined) return registryList(context)
    const discovered = await discoveryRefresh()
    if (!discovered.success) {
      const response = {
        error: { code: "internal_server_error", message: "The projects could not be loaded." },
      } satisfies ApiErrorResponse
      return context.json(response, 500)
    }

    const result = await projectDiscoveryList(options.rootDirs ?? [], { discovered: discovered.data })
    if (!result.success) {
      const response = {
        error: { code: "internal_server_error", message: "The projects could not be loaded." },
      } satisfies ApiErrorResponse
      return context.json(response, 500)
    }

    const response = result.data satisfies ProjectApiListResponse
    return context.json(response)
  })

  api.get("/project/identity", async (context) => {
    const parsed = apiRequestParse("projectApiIdentityQueryParse", projectApiIdentityQuerySchema, context.req.query())
    if (!parsed.success) {
      const response = {
        error: { code: "bad_request", message: "The project reference is invalid." },
      } satisfies ApiErrorResponse
      return context.json(response, 400)
    }

    if (options.database !== undefined) {
      const userId = requestUserId(context)
      if (userId === undefined) return unauthorized(context)
      const result = await projectRegistryIdentityResolve(options, userId, parsed.data.path)
      if (!result.success) return projectRootErrorResponse(context, result.errorMessage)
      const response = result.data satisfies ProjectApiIdentityResponse
      return context.json(response)
    }

    const discovered = await discoveryRead()
    if (!discovered.success) {
      const response = {
        error: { code: "internal_server_error", message: "The projects could not be loaded." },
      } satisfies ApiErrorResponse
      return context.json(response, 500)
    }

    const result = await projectIdentityResolve(projectConfiguredRootsResolve(options), parsed.data.path, {
      discovered: discovered.data,
    })
    if (!result.success) return projectRootErrorResponse(context, result.errorMessage)

    const response = result.data satisfies ProjectApiIdentityResponse
    return context.json(response)
  })

  api.get("/project/git/status", async (context) => {
    const root = await projectGitRootResolve(context, options, discoveryRead)
    if (!root.success) return projectRootErrorResponse(context, root.errorMessage)
    const result = await projectGitStatusRead(root.data)
    return result.success ? context.json(result.data) : projectGitErrorResponse(context, result.errorMessage)
  })

  api.get("/project/git/diff-summary", async (context) => {
    const root = await projectGitRootResolve(context, options, discoveryRead)
    if (!root.success) return projectRootErrorResponse(context, root.errorMessage)
    const result = await projectGitDiffSummaryRead(root.data)
    return result.success ? context.json(result.data) : projectGitErrorResponse(context, result.errorMessage)
  })

  api.get("/project/git/branches", async (context) => {
    const root = await projectGitRootResolve(context, options, discoveryRead)
    if (!root.success) return projectRootErrorResponse(context, root.errorMessage)
    const result = await projectGitBranchListRead(root.data)
    return result.success ? context.json(result.data) : projectGitErrorResponse(context, result.errorMessage)
  })

  api.post("/project/git/branches/switch", async (context) => {
    const root = await projectGitRootResolve(context, options, discoveryRead)
    if (!root.success) return projectRootErrorResponse(context, root.errorMessage)
    const body = await context.req.json<unknown>().catch(() => undefined)
    const parsed = apiRequestParse("projectGitBranchSwitchRequestParse", projectGitBranchRequestSchema, body)
    if (!parsed.success) return projectGitErrorResponse(context, parsed.errorMessage, 400)
    const status = await projectGitStatusRead(root.data)
    if (!status.success) return projectGitErrorResponse(context, status.errorMessage)
    if (status.data.isDirty) return projectGitErrorResponse(context, "The working tree is dirty.", 409)
    const result = await projectGitBranchSwitch(root.data, parsed.data.branch)
    return result.success ? context.json({ success: true }) : projectGitErrorResponse(context, result.errorMessage)
  })

  api.post("/project/git/branches/rename", async (context) => {
    const root = await projectGitRootResolve(context, options, discoveryRead)
    if (!root.success) return projectRootErrorResponse(context, root.errorMessage)
    const body = await context.req.json<unknown>().catch(() => undefined)
    const parsed = apiRequestParse("projectGitBranchRenameRequestParse", projectGitBranchRenameRequestSchema, body)
    if (!parsed.success) return projectGitErrorResponse(context, parsed.errorMessage, 400)
    const result = await projectGitBranchRename(root.data, parsed.data.branch, parsed.data.newBranch)
    return result.success ? context.json({ success: true }) : projectGitErrorResponse(context, result.errorMessage)
  })

  api.post("/project/git/branches/delete", async (context) => {
    const root = await projectGitRootResolve(context, options, discoveryRead)
    if (!root.success) return projectRootErrorResponse(context, root.errorMessage)
    const body = await context.req.json<unknown>().catch(() => undefined)
    const parsed = apiRequestParse("projectGitBranchDeleteRequestParse", projectGitBranchRequestSchema, body)
    if (!parsed.success) return projectGitErrorResponse(context, parsed.errorMessage, 400)
    const result = await projectGitBranchDelete(root.data, parsed.data.branch)
    return result.success ? context.json({ success: true }) : projectGitErrorResponse(context, result.errorMessage)
  })

  api.get("/project/directory", async (context) => {
    const query = queryParse(context)
    if (!query.parsed.success) {
      const response = {
        error: { code: "bad_request", message: "The project path query is invalid." },
      } satisfies ApiErrorResponse
      return context.json(response, 400)
    }

    const root = await projectRootResolve(context, options, query.projectId, discoveryRead)
    if (!root.success) return projectRootErrorResponse(context, root.errorMessage)
    const result = await projectDirectoryList(root.data, query.parsed.data.path, options.limits)
    if (!result.success) return errorResponse(context, result.errorMessage)

    const response = {
      entries: result.data.map((entry) => ({ ...entry, modifiedAt: entry.modifiedAt.toISOString() })),
    } satisfies ProjectApiDirectoryResponse
    return context.json(response)
  })

  api.get("/project/suggestions", async (context) => {
    const parsed = apiRequestParse(
      "projectApiDirectorySuggestionsQueryParse",
      projectApiDirectorySuggestionsQuerySchema,
      context.req.query(),
    )
    if (!parsed.success) {
      const response = {
        error: { code: "bad_request", message: "The project path query is invalid." },
      } satisfies ApiErrorResponse
      return context.json(response, 400)
    }

    const result = await projectDirectorySuggestionsRead(projectConfiguredRootsResolve(options), parsed.data.path)
    if (!result.success) {
      const response = {
        error: { code: "internal_server_error", message: "The project folders could not be loaded." },
      } satisfies ApiErrorResponse
      return context.json(response, 500)
    }

    const response = { suggestions: result.data } satisfies ProjectApiDirectorySuggestionsResponse
    return context.json(response)
  })

  api.post("/project/confirm", async (context) => {
    const body = await context.req.json<unknown>().catch(() => undefined)
    const parsed = apiRequestParse(
      "projectApiDirectoryConfirmRequestParse",
      projectApiDirectoryConfirmRequestSchema,
      body,
    )
    if (!parsed.success) {
      const response = {
        error: { code: "bad_request", message: "The project directory request is invalid." },
      } satisfies ApiErrorResponse
      return context.json(response, 400)
    }

    const result = await projectDirectoryConfirm(parsed.data.path, projectConfiguredRootsResolve(options))
    if (!result.success) {
      const response = {
        error: { code: "bad_request", message: "The project directory is invalid." },
      } satisfies ApiErrorResponse
      return context.json(response, 400)
    }

    const response = { project: result.data } satisfies ProjectApiDirectoryConfirmResponse
    return context.json(response)
  })

  api.get("/project/metadata", async (context) => {
    const query = queryParse(context)
    if (!query.parsed.success) {
      const response = {
        error: { code: "bad_request", message: "The project path query is invalid." },
      } satisfies ApiErrorResponse
      return context.json(response, 400)
    }

    const root = await projectRootResolve(context, options, query.projectId, discoveryRead)
    if (!root.success) return projectRootErrorResponse(context, root.errorMessage)
    const result = await projectMetadataRead(root.data, query.parsed.data.path)
    if (!result.success) return errorResponse(context, result.errorMessage)

    const response = {
      ...result.data,
      createdAt: result.data.createdAt.toISOString(),
      modifiedAt: result.data.modifiedAt.toISOString(),
    } satisfies ProjectApiMetadataResponse
    return context.json(response)
  })

  api.get("/project/text", async (context) => {
    const query = queryParse(context)
    if (!query.parsed.success) {
      const response = {
        error: { code: "bad_request", message: "The project path query is invalid." },
      } satisfies ApiErrorResponse
      return context.json(response, 400)
    }

    const root = await projectRootResolve(context, options, query.projectId, discoveryRead)
    if (!root.success) return projectRootErrorResponse(context, root.errorMessage)
    const result = await projectTextRead(root.data, query.parsed.data.path, options.limits)
    if (!result.success) return errorResponse(context, result.errorMessage)

    const response = { ...result.data } satisfies ProjectApiTextResponse
    return context.json(response)
  })

  api.get("/project/preview", async (context) => {
    const query = queryParse(context)
    if (!query.parsed.success) {
      const response = {
        error: { code: "bad_request", message: "The project path query is invalid." },
      } satisfies ApiErrorResponse
      return context.json(response, 400)
    }

    const root = await projectRootResolve(context, options, query.projectId, discoveryRead)
    if (!root.success) return projectRootErrorResponse(context, root.errorMessage)
    const result = await projectPreviewRead(root.data, query.parsed.data.path, options.limits)
    if (!result.success) return errorResponse(context, result.errorMessage)

    const response =
      result.data.kind === "text" || result.data.kind === "unsupported"
        ? result.data
        : { ...result.data, url: previewContentUrl(context, result.data.path, query.projectId) }
    return context.json(response satisfies ProjectApiPreviewResponse)
  })

  api.get("/project/preview/content", async (context) => {
    const query = queryParse(context)
    if (!query.parsed.success) {
      const response = {
        error: { code: "bad_request", message: "The project path query is invalid." },
      } satisfies ApiErrorResponse
      return context.json(response, 400)
    }

    const root = await projectRootResolve(context, options, query.projectId, discoveryRead)
    if (!root.success) return projectRootErrorResponse(context, root.errorMessage)
    const result = await projectPreviewPrepare(root.data, query.parsed.data.path, options.limits)
    if (!result.success) return errorResponse(context, result.errorMessage)

    return new Response(Readable.toWeb(result.data.createReadStream()) as unknown as BodyInit, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `inline; filename="${safeDownloadName(result.data.name)}"`,
        "Content-Length": String(result.data.size),
        "Content-Type": result.data.mimeType,
        "Last-Modified": result.data.modifiedAt.toUTCString(),
        "X-Content-Type-Options": "nosniff",
      },
    })
  })

  api.get("/project/download", async (context) => {
    const query = queryParse(context)
    if (!query.parsed.success) {
      const response = {
        error: { code: "bad_request", message: "The project path query is invalid." },
      } satisfies ApiErrorResponse
      return context.json(response, 400)
    }

    const root = await projectRootResolve(context, options, query.projectId, discoveryRead)
    if (!root.success) return projectRootErrorResponse(context, root.errorMessage)
    const result = await projectDownloadPrepare(root.data, query.parsed.data.path, options.limits)
    if (!result.success) return errorResponse(context, result.errorMessage)

    return new Response(Readable.toWeb(result.data.createReadStream()) as unknown as BodyInit, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${safeDownloadName(result.data.name)}"`,
        "Content-Length": String(result.data.size),
        "Content-Type": "application/octet-stream",
        "Last-Modified": result.data.modifiedAt.toUTCString(),
        "X-Content-Type-Options": "nosniff",
      },
    })
  })
}

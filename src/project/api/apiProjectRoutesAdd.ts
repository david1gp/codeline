import { Readable } from "node:stream"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { Context } from "hono"
import { Hono } from "hono"
import * as v from "valibot"
import { apiRequestParse } from "../../api/apiRequestParse.js"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import type { ApiErrorResponse } from "../../api/errors/apiErrorResponseSchema.js"
import { projectDirectoryList } from "../projectDirectoryList.js"
import { type ProjectDiscoveryEntriesReadResult, projectDiscoveryEntriesRead } from "../projectDiscoveryEntriesRead.js"
import { projectDiscoveryList } from "../projectDiscoveryList.js"
import { projectDownloadPrepare } from "../projectDownloadPrepare.js"
import { projectGitBranchDelete } from "../projectGitBranchDelete.js"
import { projectGitBranchListRead } from "../projectGitBranchListRead.js"
import { projectGitBranchNameSchema } from "../projectGitBranchNameSchema.js"
import { projectGitBranchRename } from "../projectGitBranchRename.js"
import { projectGitBranchSwitch } from "../projectGitBranchSwitch.js"
import { projectGitDiffSummaryRead } from "../projectGitDiffSummaryRead.js"
import { projectGitStatusRead } from "../projectGitStatusRead.js"
import type { ProjectLimits } from "../projectLimitsSchema.js"
import { projectDirectoryConfirm } from "../projectDirectoryConfirm.js"
import { projectDirectorySuggestionsRead } from "../projectDirectorySuggestionsRead.js"
import { projectMetadataRead } from "../projectMetadataRead.js"
import { projectPreviewPrepare } from "../projectPreviewPrepare.js"
import { projectPreviewRead } from "../projectPreviewRead.js"
import { projectResolve } from "../projectResolve.js"
import { projectTextRead } from "../projectTextRead.js"
import type { ProjectApiDirectoryResponse } from "./projectApiDirectoryResponseSchema.js"
import type { ProjectApiDirectoryConfirmResponse } from "./projectApiDirectoryConfirmResponseSchema.js"
import { projectApiDirectoryConfirmRequestSchema } from "./projectApiDirectoryConfirmRequestSchema.js"
import type { ProjectApiDirectorySuggestionsResponse } from "./projectApiDirectorySuggestionsResponseSchema.js"
import { projectApiDirectorySuggestionsQuerySchema } from "./projectApiDirectorySuggestionsQuerySchema.js"
import type { ProjectApiListResponse } from "./projectApiListResponseSchema.js"
import type { ProjectApiMetadataResponse } from "./projectApiMetadataResponseSchema.js"
import { projectApiPathQuerySchema } from "./projectApiPathQuerySchema.js"
import type { ProjectApiPreviewResponse } from "./projectApiPreviewResponseSchema.js"
import { projectApiProjectQuerySchema } from "./projectApiProjectQuerySchema.js"
import type { ProjectApiTextResponse } from "./projectApiTextResponseSchema.js"

type ApiContext = Context<AppEnvironment>

type ApiProjectRoutesOptions = {
  discoveryEntriesRead?: typeof projectDiscoveryEntriesRead
  limits?: ProjectLimits
  rootDir?: string
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

type DiscoveryRead = () => Promise<Result<ProjectDiscoveryEntriesReadResult>>

function queryParse(context: ApiContext, scoped: boolean) {
  const query = context.req.query()
  if (!scoped) {
    return {
      parsed: apiRequestParse("projectApiPathQueryParse", projectApiPathQuerySchema, query),
      projectId: undefined,
    }
  }

  const projectId = query.project
  const { project: _project, ...pathQuery } = query
  return {
    parsed: apiRequestParse("projectApiPathQueryParse", projectApiPathQuerySchema, pathQuery),
    projectId,
  }
}

async function projectRootResolve(
  options: ApiProjectRoutesOptions,
  projectId: unknown,
  discoveryRead?: DiscoveryRead,
): Promise<Result<string>> {
  const op = "projectRootResolve"
  if (options.rootDir !== undefined) return createResult(options.rootDir)

  const parsed = v.safeParse(projectApiProjectQuerySchema, { project: projectId })
  if (!parsed.success) return createResultError(op, "The project selection is invalid.")

  const discovered = discoveryRead === undefined ? undefined : await discoveryRead()
  if (discovered !== undefined && !discovered.success) {
    return createResultError(op, "The requested project was not found.")
  }

  const resolved = await projectResolve(options.rootDirs ?? [], parsed.output.project, {
    ...(discovered === undefined ? {} : { discovered: discovered.data }),
  })
  if (!resolved.success) return createResultError(op, "The requested project was not found.")
  return createResult(resolved.data.rootDir)
}

async function projectGitRootResolve(
  context: ApiContext,
  options: ApiProjectRoutesOptions,
  discoveryRead?: DiscoveryRead,
): Promise<Result<string>> {
  if (options.rootDir !== undefined) return createResult(options.rootDir)

  const parsed = apiRequestParse("projectApiProjectQueryParse", projectApiProjectQuerySchema, context.req.query())
  if (!parsed.success) {
    return createResultError("projectRootResolve", "The project selection is invalid.")
  }
  return projectRootResolve(options, parsed.data.project, discoveryRead)
}

function projectRootErrorResponse(context: ApiContext, errorMessage: string) {
  const invalid = errorMessage === "The project selection is invalid."
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
  return options.rootDir === undefined ? (options.rootDirs ?? []) : [options.rootDir]
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

  api.get("/project/list", async (context) => {
    if (options.rootDir !== undefined) {
      context.header("X-Codeline-Project-Mode", "legacy-single-root")
      const response = { projects: [], truncated: false } satisfies ProjectApiListResponse
      return context.json(response)
    }

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

  api.get("/project/git/status", async (context) => {
    const root = await projectGitRootResolve(
      context,
      options,
      options.rootDir === undefined ? discoveryRead : undefined,
    )
    if (!root.success) return projectRootErrorResponse(context, root.errorMessage)
    const result = await projectGitStatusRead(root.data)
    return result.success ? context.json(result.data) : projectGitErrorResponse(context, result.errorMessage)
  })

  api.get("/project/git/diff-summary", async (context) => {
    const root = await projectGitRootResolve(
      context,
      options,
      options.rootDir === undefined ? discoveryRead : undefined,
    )
    if (!root.success) return projectRootErrorResponse(context, root.errorMessage)
    const result = await projectGitDiffSummaryRead(root.data)
    return result.success ? context.json(result.data) : projectGitErrorResponse(context, result.errorMessage)
  })

  api.get("/project/git/branches", async (context) => {
    const root = await projectGitRootResolve(
      context,
      options,
      options.rootDir === undefined ? discoveryRead : undefined,
    )
    if (!root.success) return projectRootErrorResponse(context, root.errorMessage)
    const result = await projectGitBranchListRead(root.data)
    return result.success ? context.json(result.data) : projectGitErrorResponse(context, result.errorMessage)
  })

  api.post("/project/git/branches/switch", async (context) => {
    const root = await projectGitRootResolve(
      context,
      options,
      options.rootDir === undefined ? discoveryRead : undefined,
    )
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
    const root = await projectGitRootResolve(
      context,
      options,
      options.rootDir === undefined ? discoveryRead : undefined,
    )
    if (!root.success) return projectRootErrorResponse(context, root.errorMessage)
    const body = await context.req.json<unknown>().catch(() => undefined)
    const parsed = apiRequestParse("projectGitBranchRenameRequestParse", projectGitBranchRenameRequestSchema, body)
    if (!parsed.success) return projectGitErrorResponse(context, parsed.errorMessage, 400)
    const result = await projectGitBranchRename(root.data, parsed.data.branch, parsed.data.newBranch)
    return result.success ? context.json({ success: true }) : projectGitErrorResponse(context, result.errorMessage)
  })

  api.post("/project/git/branches/delete", async (context) => {
    const root = await projectGitRootResolve(
      context,
      options,
      options.rootDir === undefined ? discoveryRead : undefined,
    )
    if (!root.success) return projectRootErrorResponse(context, root.errorMessage)
    const body = await context.req.json<unknown>().catch(() => undefined)
    const parsed = apiRequestParse("projectGitBranchDeleteRequestParse", projectGitBranchRequestSchema, body)
    if (!parsed.success) return projectGitErrorResponse(context, parsed.errorMessage, 400)
    const result = await projectGitBranchDelete(root.data, parsed.data.branch)
    return result.success ? context.json({ success: true }) : projectGitErrorResponse(context, result.errorMessage)
  })

  api.get("/project/directory", async (context) => {
    const query = queryParse(context, options.rootDir === undefined)
    if (!query.parsed.success) {
      const response = {
        error: { code: "bad_request", message: "The project path query is invalid." },
      } satisfies ApiErrorResponse
      return context.json(response, 400)
    }

    const root = await projectRootResolve(
      options,
      query.projectId,
      options.rootDir === undefined ? discoveryRead : undefined,
    )
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
    const query = queryParse(context, options.rootDir === undefined)
    if (!query.parsed.success) {
      const response = {
        error: { code: "bad_request", message: "The project path query is invalid." },
      } satisfies ApiErrorResponse
      return context.json(response, 400)
    }

    const root = await projectRootResolve(
      options,
      query.projectId,
      options.rootDir === undefined ? discoveryRead : undefined,
    )
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
    const query = queryParse(context, options.rootDir === undefined)
    if (!query.parsed.success) {
      const response = {
        error: { code: "bad_request", message: "The project path query is invalid." },
      } satisfies ApiErrorResponse
      return context.json(response, 400)
    }

    const root = await projectRootResolve(
      options,
      query.projectId,
      options.rootDir === undefined ? discoveryRead : undefined,
    )
    if (!root.success) return projectRootErrorResponse(context, root.errorMessage)
    const result = await projectTextRead(root.data, query.parsed.data.path, options.limits)
    if (!result.success) return errorResponse(context, result.errorMessage)

    const response = { ...result.data } satisfies ProjectApiTextResponse
    return context.json(response)
  })

  api.get("/project/preview", async (context) => {
    const query = queryParse(context, options.rootDir === undefined)
    if (!query.parsed.success) {
      const response = {
        error: { code: "bad_request", message: "The project path query is invalid." },
      } satisfies ApiErrorResponse
      return context.json(response, 400)
    }

    const root = await projectRootResolve(
      options,
      query.projectId,
      options.rootDir === undefined ? discoveryRead : undefined,
    )
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
    const query = queryParse(context, options.rootDir === undefined)
    if (!query.parsed.success) {
      const response = {
        error: { code: "bad_request", message: "The project path query is invalid." },
      } satisfies ApiErrorResponse
      return context.json(response, 400)
    }

    const root = await projectRootResolve(
      options,
      query.projectId,
      options.rootDir === undefined ? discoveryRead : undefined,
    )
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
    const query = queryParse(context, options.rootDir === undefined)
    if (!query.parsed.success) {
      const response = {
        error: { code: "bad_request", message: "The project path query is invalid." },
      } satisfies ApiErrorResponse
      return context.json(response, 400)
    }

    const root = await projectRootResolve(
      options,
      query.projectId,
      options.rootDir === undefined ? discoveryRead : undefined,
    )
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

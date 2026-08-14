import { Readable } from "node:stream"
import type { Context } from "hono"
import { Hono } from "hono"
import { apiRequestParse } from "../../api/apiRequestParse.js"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import type { ApiErrorResponse } from "../../api/errors/apiErrorResponseSchema.js"
import { projectDirectoryList } from "../projectDirectoryList.js"
import { projectDownloadPrepare } from "../projectDownloadPrepare.js"
import { projectGitBranchDelete } from "../projectGitBranchDelete.js"
import { projectGitBranchListRead } from "../projectGitBranchListRead.js"
import { projectGitBranchNameSchema } from "../projectGitBranchNameSchema.js"
import { projectGitBranchRename } from "../projectGitBranchRename.js"
import { projectGitBranchSwitch } from "../projectGitBranchSwitch.js"
import { projectGitDiffSummaryRead } from "../projectGitDiffSummaryRead.js"
import { projectGitStatusRead } from "../projectGitStatusRead.js"
import type { ProjectLimits } from "../projectLimitsSchema.js"
import { projectMetadataRead } from "../projectMetadataRead.js"
import { projectPreviewPrepare } from "../projectPreviewPrepare.js"
import { projectPreviewRead } from "../projectPreviewRead.js"
import { projectTextRead } from "../projectTextRead.js"
import type { ProjectApiDirectoryResponse } from "./projectApiDirectoryResponseSchema.js"
import type { ProjectApiMetadataResponse } from "./projectApiMetadataResponseSchema.js"
import { projectApiPathQuerySchema } from "./projectApiPathQuerySchema.js"
import type { ProjectApiPreviewResponse } from "./projectApiPreviewResponseSchema.js"
import type { ProjectApiTextResponse } from "./projectApiTextResponseSchema.js"
import * as v from "valibot"

type ApiContext = Context<AppEnvironment>

type ApiProjectRoutesOptions = {
  limits?: ProjectLimits
  rootDir: string
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

function queryParse(context: ApiContext) {
  return apiRequestParse("projectApiPathQueryParse", projectApiPathQuerySchema, context.req.query())
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

function previewContentUrl(context: ApiContext, relativePath: string): string {
  const requestPath = new URL(context.req.url).pathname
  const routePrefix = requestPath.slice(0, requestPath.lastIndexOf("/project/preview"))
  return `${routePrefix}/project/preview/content?path=${encodeURIComponent(relativePath)}`
}

export function apiProjectRoutesAdd(api: Hono<AppEnvironment>, options: ApiProjectRoutesOptions): void {
  api.get("/project/git/status", async (context) => {
    const result = await projectGitStatusRead(options.rootDir)
    return result.success ? context.json(result.data) : projectGitErrorResponse(context, result.errorMessage)
  })

  api.get("/project/git/diff-summary", async (context) => {
    const result = await projectGitDiffSummaryRead(options.rootDir)
    return result.success ? context.json(result.data) : projectGitErrorResponse(context, result.errorMessage)
  })

  api.get("/project/git/branches", async (context) => {
    const result = await projectGitBranchListRead(options.rootDir)
    return result.success ? context.json(result.data) : projectGitErrorResponse(context, result.errorMessage)
  })

  api.post("/project/git/branches/switch", async (context) => {
    const body = await context.req.json<unknown>().catch(() => undefined)
    const parsed = apiRequestParse("projectGitBranchSwitchRequestParse", projectGitBranchRequestSchema, body)
    if (!parsed.success) return projectGitErrorResponse(context, parsed.errorMessage, 400)
    const status = await projectGitStatusRead(options.rootDir)
    if (!status.success) return projectGitErrorResponse(context, status.errorMessage)
    if (status.data.isDirty) return projectGitErrorResponse(context, "The working tree is dirty.", 409)
    const result = await projectGitBranchSwitch(options.rootDir, parsed.data.branch)
    return result.success ? context.json({ success: true }) : projectGitErrorResponse(context, result.errorMessage)
  })

  api.post("/project/git/branches/rename", async (context) => {
    const body = await context.req.json<unknown>().catch(() => undefined)
    const parsed = apiRequestParse("projectGitBranchRenameRequestParse", projectGitBranchRenameRequestSchema, body)
    if (!parsed.success) return projectGitErrorResponse(context, parsed.errorMessage, 400)
    const result = await projectGitBranchRename(options.rootDir, parsed.data.branch, parsed.data.newBranch)
    return result.success ? context.json({ success: true }) : projectGitErrorResponse(context, result.errorMessage)
  })

  api.post("/project/git/branches/delete", async (context) => {
    const body = await context.req.json<unknown>().catch(() => undefined)
    const parsed = apiRequestParse("projectGitBranchDeleteRequestParse", projectGitBranchRequestSchema, body)
    if (!parsed.success) return projectGitErrorResponse(context, parsed.errorMessage, 400)
    const result = await projectGitBranchDelete(options.rootDir, parsed.data.branch)
    return result.success ? context.json({ success: true }) : projectGitErrorResponse(context, result.errorMessage)
  })

  api.get("/project/directory", async (context) => {
    const parsed = queryParse(context)
    if (!parsed.success) {
      const response = {
        error: { code: "bad_request", message: "The project path query is invalid." },
      } satisfies ApiErrorResponse
      return context.json(response, 400)
    }

    const result = await projectDirectoryList(options.rootDir, parsed.data.path, options.limits)
    if (!result.success) return errorResponse(context, result.errorMessage)

    const response = {
      entries: result.data.map((entry) => ({ ...entry, modifiedAt: entry.modifiedAt.toISOString() })),
    } satisfies ProjectApiDirectoryResponse
    return context.json(response)
  })

  api.get("/project/metadata", async (context) => {
    const parsed = queryParse(context)
    if (!parsed.success) {
      const response = {
        error: { code: "bad_request", message: "The project path query is invalid." },
      } satisfies ApiErrorResponse
      return context.json(response, 400)
    }

    const result = await projectMetadataRead(options.rootDir, parsed.data.path)
    if (!result.success) return errorResponse(context, result.errorMessage)

    const response = {
      ...result.data,
      createdAt: result.data.createdAt.toISOString(),
      modifiedAt: result.data.modifiedAt.toISOString(),
    } satisfies ProjectApiMetadataResponse
    return context.json(response)
  })

  api.get("/project/text", async (context) => {
    const parsed = queryParse(context)
    if (!parsed.success) {
      const response = {
        error: { code: "bad_request", message: "The project path query is invalid." },
      } satisfies ApiErrorResponse
      return context.json(response, 400)
    }

    const result = await projectTextRead(options.rootDir, parsed.data.path, options.limits)
    if (!result.success) return errorResponse(context, result.errorMessage)

    const response = { ...result.data } satisfies ProjectApiTextResponse
    return context.json(response)
  })

  api.get("/project/preview", async (context) => {
    const parsed = queryParse(context)
    if (!parsed.success) {
      const response = {
        error: { code: "bad_request", message: "The project path query is invalid." },
      } satisfies ApiErrorResponse
      return context.json(response, 400)
    }

    const result = await projectPreviewRead(options.rootDir, parsed.data.path, options.limits)
    if (!result.success) return errorResponse(context, result.errorMessage)

    const response =
      result.data.kind === "text" || result.data.kind === "unsupported"
        ? result.data
        : { ...result.data, url: previewContentUrl(context, result.data.path) }
    return context.json(response satisfies ProjectApiPreviewResponse)
  })

  api.get("/project/preview/content", async (context) => {
    const parsed = queryParse(context)
    if (!parsed.success) {
      const response = {
        error: { code: "bad_request", message: "The project path query is invalid." },
      } satisfies ApiErrorResponse
      return context.json(response, 400)
    }

    const result = await projectPreviewPrepare(options.rootDir, parsed.data.path, options.limits)
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
    const parsed = queryParse(context)
    if (!parsed.success) {
      const response = {
        error: { code: "bad_request", message: "The project path query is invalid." },
      } satisfies ApiErrorResponse
      return context.json(response, 400)
    }

    const result = await projectDownloadPrepare(options.rootDir, parsed.data.path, options.limits)
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

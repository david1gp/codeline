import type { Context } from "hono"
import { Hono } from "hono"
import { apiRequestParse } from "../../api/apiRequestParse.js"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import { apiIfNoneMatchMatches } from "../../api/conditional/apiIfNoneMatchMatches.js"
import type { ApiErrorResponse } from "../../api/errors/apiErrorResponseSchema.js"
import { apiRepresentationEtagCreate } from "../../api/representation/apiRepresentationEtagCreate.js"
import { apiRepresentationHeadersCreate } from "../../api/representation/apiRepresentationHeadersCreate.js"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { projectApiProjectQuerySchema } from "../../project/api/projectApiProjectQuerySchema.js"
import { projectResolve } from "../../project/projectResolve.js"
import type { SkillCatalogDiscoverOptions } from "../actions/skillCatalogDiscover.js"
import { skillCatalogDiscover } from "../actions/skillCatalogDiscover.js"
import { skillCatalogInspectionResponseCreate } from "../actions/skillCatalogInspectionResponseCreate.js"
import type { SkillPresetCatalogLoadOptions } from "../actions/skillPresetCatalogLoad.js"
import { skillPresetCatalogLoad } from "../actions/skillPresetCatalogLoad.js"
import { skillPresetInspectionResponseCreate } from "../actions/skillPresetInspectionResponseCreate.js"
import { skillPresetResolve } from "../actions/skillPresetResolve.js"
import { skillSelectionDefaultDelete } from "../actions/skillSelectionDefaultDelete.js"
import { skillSelectionDefaultLoad } from "../actions/skillSelectionDefaultLoad.js"
import { skillSelectionDefaultUpsert } from "../actions/skillSelectionDefaultUpsert.js"
import { skillSelectionInspectionResponseCreate } from "../actions/skillSelectionInspectionResponseCreate.js"
import { skillSelectionPreSessionResolve } from "../actions/skillSelectionPreSessionResolve.js"
import { skillSelectionDefaultRequestSchema } from "../schema/skillSelectionDefaultRequestSchema.js"
import { skillSelectionDefaultQuerySchema } from "./skillSelectionDefaultQuerySchema.js"
import { skillSelectionDefaultResponseCreate } from "./skillSelectionDefaultResponseCreate.js"
import { skillSelectionInspectionQuerySchema } from "./skillSelectionInspectionQuerySchema.js"

type ApiContext = Context<AppEnvironment>

type ApiSkillRoutesOptions = {
  database?: DatabaseClient
  globalSkillsPath?: string
  rootDirs?: readonly string[]
  skillCatalogDiscover?: typeof skillCatalogDiscover
  skillPresetCatalogLoad?: typeof skillPresetCatalogLoad
  skillSelectionDefaultDelete?: typeof skillSelectionDefaultDelete
  skillSelectionDefaultLoad?: typeof skillSelectionDefaultLoad
  skillSelectionDefaultUpsert?: typeof skillSelectionDefaultUpsert
}

function unauthorized(context: ApiContext) {
  const response = {
    error: { code: "unauthorized", message: "Authentication is required." },
  } satisfies ApiErrorResponse
  return context.json(response, 401)
}

function badRequest(context: ApiContext, message = "The skill request is invalid.") {
  const response = { error: { code: "bad_request", message } } satisfies ApiErrorResponse
  return context.json(response, 400)
}

function notFound(context: ApiContext) {
  const response = {
    error: { code: "not_found", message: "The requested resource was not found." },
  } satisfies ApiErrorResponse
  return context.json(response, 404)
}

function internalServerError(context: ApiContext) {
  const response = {
    error: { code: "internal_server_error", message: "The skill request could not be completed." },
  } satisfies ApiErrorResponse
  return context.json(response, 500)
}

function requestUserId(context: ApiContext): string | undefined {
  const userId = context.var.requestIdentity?.userId
  return typeof userId === "string" && userId.length > 0 ? userId : undefined
}

async function projectResolveFromQuery(context: ApiContext, rootDirs: readonly string[]) {
  const parsed = apiRequestParse("skillProjectQueryParse", projectApiProjectQuerySchema, context.req.query())
  if (!parsed.success) return { parsed: undefined, project: undefined }
  const project = await projectResolve(rootDirs, parsed.data.project)
  return { parsed, project: project.success ? project.data : undefined }
}

function defaultEtag(projectPath: string, revision: number): string {
  return apiRepresentationEtagCreate(`skill-selection-default:${projectPath}`, "1", revision)
}

export function apiSkillRoutesAdd(api: Hono<AppEnvironment>, options: ApiSkillRoutesOptions = {}): void {
  api.get("/project/skills/catalog", async (context) => {
    if (requestUserId(context) === undefined) return unauthorized(context)
    const resolved = await projectResolveFromQuery(context, options.rootDirs ?? [])
    if (resolved.parsed === undefined) return badRequest(context, "The project selection is invalid.")
    if (resolved.project === undefined) return notFound(context)
    const discover = (options.skillCatalogDiscover ?? skillCatalogDiscover) as (
      options: SkillCatalogDiscoverOptions,
    ) => ReturnType<typeof skillCatalogDiscover>
    const catalog = await discover({
      ...(options.globalSkillsPath === undefined ? {} : { globalSkillsPath: options.globalSkillsPath }),
      projectRoot: resolved.project.rootDir,
    })
    if (!catalog.success) return internalServerError(context)
    const response = skillCatalogInspectionResponseCreate({
      catalog: catalog.data,
      projectId: resolved.project.id,
      projectRoot: resolved.project.rootDir,
    })
    if (!response.success) return internalServerError(context)
    return context.json(response.data)
  })

  api.get("/project/skills/presets", async (context) => {
    if (requestUserId(context) === undefined) return unauthorized(context)
    const resolved = await projectResolveFromQuery(context, options.rootDirs ?? [])
    if (resolved.parsed === undefined) return badRequest(context, "The project selection is invalid.")
    if (resolved.project === undefined) return notFound(context)
    const load = (options.skillPresetCatalogLoad ?? skillPresetCatalogLoad) as (
      options: SkillPresetCatalogLoadOptions,
    ) => ReturnType<typeof skillPresetCatalogLoad>
    const catalog = await load({ projectRoot: resolved.project.rootDir })
    if (!catalog.success) return internalServerError(context)
    const response = skillPresetInspectionResponseCreate({
      catalog: catalog.data,
      projectId: resolved.project.id,
      projectRoot: resolved.project.rootDir,
    })
    if (!response.success) return internalServerError(context)
    return context.json(response.data)
  })

  api.get("/project/skills/selection", async (context) => {
    const userId = requestUserId(context)
    if (userId === undefined) return unauthorized(context)
    const parsed = apiRequestParse(
      "skillSelectionInspectionQueryParse",
      skillSelectionInspectionQuerySchema,
      context.req.query(),
    )
    if (!parsed.success) return badRequest(context, "The project selection is invalid.")
    const project = await projectResolve(options.rootDirs ?? [], parsed.data.project)
    if (!project.success) return notFound(context)
    if (options.database === undefined) return internalServerError(context)
    const discover = (options.skillCatalogDiscover ?? skillCatalogDiscover) as (
      options: SkillCatalogDiscoverOptions,
    ) => ReturnType<typeof skillCatalogDiscover>
    const load = (options.skillPresetCatalogLoad ?? skillPresetCatalogLoad) as (
      options: SkillPresetCatalogLoadOptions,
    ) => ReturnType<typeof skillPresetCatalogLoad>
    const [catalog, presetCatalog] = await Promise.all([
      discover({
        ...(options.globalSkillsPath === undefined ? {} : { globalSkillsPath: options.globalSkillsPath }),
        projectRoot: project.data.rootDir,
      }),
      load({ projectRoot: project.data.rootDir }),
    ])
    if (!catalog.success || !presetCatalog.success) return internalServerError(context)
    const saved = await (options.skillSelectionDefaultLoad ?? skillSelectionDefaultLoad)(
      options.database,
      userId,
      project.data.rootDir,
      { projectRootDirs: [...(options.rootDirs ?? []), project.data.rootDir] },
    )
    if (!saved.success) return internalServerError(context)
    const selection = skillSelectionPreSessionResolve({
      catalog: catalog.data,
      defaultPreference:
        saved.data === undefined
          ? undefined
          : { override: saved.data.selectionOverride, presetName: saved.data.presetName },
      presetCatalog: presetCatalog.data,
      request: parsed.data.preset === undefined ? undefined : { presetName: parsed.data.preset },
    })
    if (!selection.success)
      return selection.errorMessage.includes("could not be found") ? notFound(context) : badRequest(context)
    const preset = skillPresetResolve({ catalog: presetCatalog.data, presetName: selection.data.presetName })
    if (!preset.success) return internalServerError(context)
    const response = skillSelectionInspectionResponseCreate({
      catalogDigest: catalog.data.digest,
      preset: preset.data,
      presetCatalogDigest: presetCatalog.data.digest,
      projectId: project.data.id,
      selection: selection.data,
    })
    if (!response.success) return internalServerError(context)
    return context.json(response.data)
  })

  api.get("/project/skill-selection-default", async (context) => {
    const userId = requestUserId(context)
    if (userId === undefined) return unauthorized(context)
    if (options.database === undefined) return internalServerError(context)
    const parsed = apiRequestParse(
      "skillSelectionDefaultQueryParse",
      skillSelectionDefaultQuerySchema,
      context.req.query(),
    )
    if (!parsed.success) return badRequest(context, "The project path query is invalid.")
    const result = await (options.skillSelectionDefaultLoad ?? skillSelectionDefaultLoad)(
      options.database,
      userId,
      parsed.data.projectPath,
      { projectRootDirs: options.rootDirs },
    )
    if (!result.success) return badRequest(context, "The project path is invalid.")
    if (result.data === undefined) return notFound(context)
    const response = skillSelectionDefaultResponseCreate(result.data)
    if (!response.success) return internalServerError(context)
    const etag = defaultEtag(response.data.projectPath, response.data.revision)
    const headers = apiRepresentationHeadersCreate(etag)
    if (apiIfNoneMatchMatches(context.req.header("If-None-Match"), etag))
      return new Response(null, { headers, status: 304 })
    for (const [name, value] of headers.entries()) context.header(name, value)
    return context.json(response.data)
  })

  api.put("/project/skill-selection-default", async (context) => {
    const userId = requestUserId(context)
    if (userId === undefined) return unauthorized(context)
    if (options.database === undefined) return internalServerError(context)
    const body = await context.req.json<unknown>().catch(() => undefined)
    const parsed = apiRequestParse("skillSelectionDefaultRequestParse", skillSelectionDefaultRequestSchema, body)
    if (!parsed.success) return badRequest(context)
    const result = await (options.skillSelectionDefaultUpsert ?? skillSelectionDefaultUpsert)(
      options.database,
      userId,
      parsed.data,
      { projectRootDirs: options.rootDirs },
    )
    if (!result.success) return badRequest(context)
    const response = skillSelectionDefaultResponseCreate(result.data)
    if (!response.success) return internalServerError(context)
    const headers = apiRepresentationHeadersCreate(defaultEtag(response.data.projectPath, response.data.revision))
    for (const [name, value] of headers.entries()) context.header(name, value)
    return context.json(response.data)
  })

  api.delete("/project/skill-selection-default", async (context) => {
    const userId = requestUserId(context)
    if (userId === undefined) return unauthorized(context)
    if (options.database === undefined) return internalServerError(context)
    const parsed = apiRequestParse(
      "skillSelectionDefaultQueryParse",
      skillSelectionDefaultQuerySchema,
      context.req.query(),
    )
    if (!parsed.success) return badRequest(context, "The project path query is invalid.")
    const result = await (options.skillSelectionDefaultDelete ?? skillSelectionDefaultDelete)(
      options.database,
      userId,
      parsed.data.projectPath,
      { projectRootDirs: options.rootDirs },
    )
    if (!result.success) return internalServerError(context)
    if (result.data === undefined) return notFound(context)
    return new Response(null, { status: 204 })
  })
}

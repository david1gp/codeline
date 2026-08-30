import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import type { DatabaseExecutor } from "../database/databaseClient.js"
import { projectDirectoryCanonicalPathResolve } from "./projectDirectoryCanonicalPathResolve.js"
import { projectDiscoveryIdSchema } from "./projectDiscoveryIdSchema.js"
import { projectIdSchema } from "./projectIdSchema.js"
import { projectRegistryProjectPathAuthorize } from "./projectRegistryProjectPathAuthorize.js"
import {
  type ProjectDiscoveryEntriesReadOptions,
  type ProjectDiscoveryEntriesReadResult,
  projectDiscoveryEntriesRead,
} from "./projectDiscoveryEntriesRead.js"
import { projectRegistryRepositoryResolve } from "./db/projectRegistryRepositoryResolve.js"

export type ProjectResolveOptions = ProjectDiscoveryEntriesReadOptions & {
  database?: DatabaseExecutor
  discovered?: ProjectDiscoveryEntriesReadResult
  userId?: string
}

export type ProjectResolved = {
  id: string
  rootDir: string
}

export async function projectResolve(
  rootDirs: readonly string[],
  projectId: string,
  options: ProjectResolveOptions = {},
): Promise<Result<ProjectResolved>> {
  const op = "projectResolve"
  const projectIdParsed = v.safeParse(
    options.database !== undefined || options.userId !== undefined ? projectIdSchema : projectDiscoveryIdSchema,
    projectId,
  )
  if (!projectIdParsed.success) {
    return createResultError(op, "The project identifier is invalid.")
  }

  if (options.database !== undefined || options.userId !== undefined) {
    if (options.database === undefined || options.userId === undefined || options.userId.length === 0) {
      return createResultError(op, "The project could not be found.")
    }

    const registered = await projectRegistryRepositoryResolve(options.database, options.userId, projectId)
    if (!registered.success) return createResultError(op, "The project could not be found.")

    const canonical = await projectRegistryProjectPathAuthorize(registered.data, rootDirs)
    if (!canonical.success) return createResultError(op, "The project could not be found.")
    return createResult({ id: registered.data.id, rootDir: canonical.data })
  }

  const { database: _database, userId: _userId, discovered: cached, ...readOptions } = options
  const discovered =
    cached === undefined
      ? await projectDiscoveryEntriesRead(rootDirs, readOptions)
      : { success: true as const, data: cached }
  if (!discovered.success) return createResultError(op, "The project set is unavailable.")

  const project = discovered.data.entries.find((entry) => entry.id === projectId)
  if (project === undefined) return createResultError(op, "The project identifier is not discovered.")
  const canonical = await projectDirectoryCanonicalPathResolve(project.canonicalPath)
  if (!canonical.success) {
    return createResultError(op, "The selected project directory is unavailable.")
  }

  return createResult({ id: project.id, rootDir: project.canonicalPath })
}

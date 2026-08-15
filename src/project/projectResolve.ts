import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { projectDirectoryCanonicalPathResolve } from "./projectDirectoryCanonicalPathResolve.js"
import {
  type ProjectDiscoveryEntriesReadOptions,
  type ProjectDiscoveryEntriesReadResult,
  projectDiscoveryEntriesRead,
} from "./projectDiscoveryEntriesRead.js"

export type ProjectResolveOptions = ProjectDiscoveryEntriesReadOptions & {
  discovered?: ProjectDiscoveryEntriesReadResult
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
  if (typeof projectId !== "string" || !/^[a-f0-9]{64}$/.test(projectId)) {
    return createResultError(op, "The project identifier is invalid.")
  }

  const { discovered: cached, ...readOptions } = options
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

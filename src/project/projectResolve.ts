import * as fs from "node:fs/promises"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
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

async function projectDirectoryCanonicalPathValidate(canonicalPath: string): Promise<boolean> {
  try {
    const currentStat = await fs.lstat(canonicalPath)
    if (currentStat.isSymbolicLink() || !currentStat.isDirectory()) return false

    const currentCanonicalPath = await fs.realpath(canonicalPath)
    if (currentCanonicalPath !== canonicalPath) return false

    const canonicalStat = await fs.lstat(currentCanonicalPath)
    return !canonicalStat.isSymbolicLink() && canonicalStat.isDirectory()
  } catch (_error) {
    return false
  }
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
  if (!(await projectDirectoryCanonicalPathValidate(project.canonicalPath))) {
    return createResultError(op, "The selected project directory is unavailable.")
  }

  return createResult({ id: project.id, rootDir: project.canonicalPath })
}

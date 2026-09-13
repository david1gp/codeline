import * as os from "node:os"
import * as path from "node:path"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { projectDirectoryCanonicalPathResolve } from "./projectDirectoryCanonicalPathResolve.js"
import {
  type ProjectDiscoveryEntriesReadOptions,
  type ProjectDiscoveryEntriesReadResult,
  projectDiscoveryEntriesRead,
} from "./projectDiscoveryEntriesRead.js"
import { projectDiscoveryList } from "./projectDiscoveryList.js"

export type ProjectIdentityResolveOptions = ProjectDiscoveryEntriesReadOptions & {
  discovered?: ProjectDiscoveryEntriesReadResult
}

export type ProjectIdentity = {
  id: string
  label: string
}

/**
 * Resolves a filesystem project reference to its discovered identity. The browser
 * knows a session's project reference but must never guess an id from a display
 * label, because labels are disambiguated and are not stable identifiers.
 */
export async function projectIdentityResolve(
  rootDirs: readonly string[],
  projectPath: string,
  options: ProjectIdentityResolveOptions = {},
): Promise<Result<ProjectIdentity>> {
  const op = "projectIdentityResolve"
  if (typeof projectPath !== "string" || projectPath.trim().length === 0) {
    return createResultError(op, "The project reference is invalid.")
  }

  const requestedPath = projectPath === "~" ? path.resolve(os.homedir()) : projectPath
  if (!path.isAbsolute(requestedPath)) return createResultError(op, "The project reference is invalid.")

  const canonical = await projectDirectoryCanonicalPathResolve(requestedPath)
  if (!canonical.success) return createResultError(op, "The requested project was not found.")

  const { discovered: cached, ...readOptions } = options
  const discovered =
    cached === undefined ? await projectDiscoveryEntriesRead(rootDirs, readOptions) : createResult(cached)
  if (!discovered.success) return createResultError(op, "The project set is unavailable.")

  const entry = discovered.data.entries.find(({ canonicalPath }) => canonicalPath === canonical.data)
  if (entry === undefined) return createResultError(op, "The requested project was not found.")

  const listed = await projectDiscoveryList(rootDirs, { ...readOptions, discovered: discovered.data })
  if (!listed.success) return createResultError(op, "The project set is unavailable.")

  const selection = listed.data.projects.find(({ id }) => id === entry.id)
  if (selection === undefined) return createResultError(op, "The requested project was not found.")
  return createResult({ id: selection.id, label: selection.label })
}

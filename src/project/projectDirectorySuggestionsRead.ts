import type { Dir } from "node:fs"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { projectDirectoryCanonicalPathResolve } from "./projectDirectoryCanonicalPathResolve.js"
import { projectDiscoveryLimits } from "./projectDiscoveryLimits.js"
import { projectPathResolve } from "./projectPathResolve.js"
import { projectPathValidate } from "./projectPathValidate.js"

type ProjectDirectorySuggestion = {
  path: string
  label: string
}

type SuggestionQuery = {
  parentPath: string
  prefix: string
  exactRoot?: string
}

function projectPathIsWithin(rootDir: string, targetPath: string): boolean {
  const relativePath = path.relative(rootDir, targetPath)
  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${path.sep}`) && relativePath !== ".." && !path.isAbsolute(relativePath))
  )
}

function suggestionQueryResolve(rootDir: string, query: string): Result<SuggestionQuery> {
  const op = "projectDirectorySuggestionsRead"
  if (query.includes("\0") || query.includes("\\")) return createResultError(op, "The project path query is invalid.")

  if (path.isAbsolute(query)) {
    const absoluteSegments = query.split(path.sep)
    if (
      absoluteSegments.slice(1).some((segment, index, segments) => {
        const isTrailingEmpty = segment === "" && index === segments.length - 1
        return !isTrailingEmpty && (segment === "" || segment === "." || segment === "..")
      })
    ) {
      return createResultError(op, "The project path query is invalid.")
    }
    const absoluteQuery = path.resolve(query)
    if (!projectPathIsWithin(rootDir, absoluteQuery)) return createResultError(op, "The project path query is invalid.")
    if (absoluteQuery === rootDir && !query.endsWith(path.sep))
      return createResult({ parentPath: "", prefix: "", exactRoot: rootDir })

    const hasTrailingSeparator = query.endsWith(path.sep)
    const relativeQuery = path.relative(rootDir, absoluteQuery)
    const value = hasTrailingSeparator ? relativeQuery : path.posix.normalize(relativeQuery)
    const relativePath = hasTrailingSeparator ? value : path.posix.dirname(value)
    const validated = projectPathValidate(relativePath === "." ? "" : relativePath)
    if (!validated.success) return createResultError(op, "The project path query is invalid.")
    return createResult({
      parentPath: validated.data.normalizedPath,
      prefix: hasTrailingSeparator ? "" : path.posix.basename(value),
    })
  }

  const hasTrailingSeparator = query.endsWith("/")
  const value = hasTrailingSeparator ? query.slice(0, -1) : query
  const validated = projectPathValidate(value)
  if (!validated.success) return createResultError(op, "The project path query is invalid.")
  const relativePath = validated.data.normalizedPath
  if (hasTrailingSeparator || relativePath === "") {
    return createResult({ parentPath: relativePath, prefix: "" })
  }

  return createResult({
    parentPath: path.posix.dirname(relativePath) === "." ? "" : path.posix.dirname(relativePath),
    prefix: path.posix.basename(relativePath),
  })
}

async function projectDirectorySuggestionRead(
  rootDir: string,
  query: string,
): Promise<Result<ProjectDirectorySuggestion[]>> {
  const op = "projectDirectorySuggestionsRead"
  const root = await projectDirectoryCanonicalPathResolve(rootDir)
  if (!root.success) return createResult([])

  const parsedQuery = suggestionQueryResolve(root.data, query)
  if (!parsedQuery.success) return parsedQuery
  if (parsedQuery.data.exactRoot !== undefined) {
    return createResult([
      {
        path: parsedQuery.data.exactRoot,
        label: path.basename(parsedQuery.data.exactRoot) || parsedQuery.data.exactRoot,
      },
    ])
  }

  const resolved = await projectPathResolve(root.data, parsedQuery.data.parentPath)
  if (!resolved.success) return createResult([])

  const suggestions: ProjectDirectorySuggestion[] =
    query === "" ? [{ path: root.data, label: path.basename(root.data) || root.data }] : []

  let directory: Dir
  try {
    directory = await fs.opendir(resolved.data.targetAbsolutePath)
  } catch (_error) {
    return createResult([])
  }

  let scannedEntries = 0
  try {
    for (;;) {
      const entry = await directory.read()
      if (entry === null || entry === undefined) break
      scannedEntries += 1
      if (scannedEntries > projectDiscoveryLimits.maximumEntriesPerRoot) break
      if (entry.isSymbolicLink() || !entry.isDirectory()) continue
      if (!entry.name.toLocaleLowerCase().startsWith(parsedQuery.data.prefix.toLocaleLowerCase())) continue

      const candidatePath = path.join(resolved.data.targetAbsolutePath, entry.name)
      const canonical = await projectDirectoryCanonicalPathResolve(candidatePath)
      if (!canonical.success || !projectPathIsWithin(root.data, canonical.data)) continue
      suggestions.push({ path: canonical.data, label: entry.name })
    }
  } catch (_error) {
    return createResultError(op, "The project roots are unavailable.")
  } finally {
    try {
      await directory.close()
    } catch (_error) {
      // Suggestions are bounded and can be discarded if closing fails.
    }
  }

  suggestions.sort((left, right) => {
    const leftKey = left.label.toLocaleLowerCase()
    const rightKey = right.label.toLocaleLowerCase()
    if (leftKey < rightKey) return -1
    if (leftKey > rightKey) return 1
    return left.label.localeCompare(right.label)
  })
  return createResult(suggestions.slice(0, projectDiscoveryLimits.maximumSuggestions))
}

export async function projectDirectorySuggestionsRead(
  rootDirs: readonly string[],
  query = "",
): Promise<Result<ProjectDirectorySuggestion[]>> {
  const op = "projectDirectorySuggestionsRead"
  if (typeof query !== "string" || query.length > 4096)
    return createResultError(op, "The project path query is invalid.")

  const suggestions = new Map<string, ProjectDirectorySuggestion>()
  const maximumRoots = Math.min(rootDirs.length, projectDiscoveryLimits.maximumRoots)
  for (const rootDir of rootDirs.slice(0, maximumRoots)) {
    if (typeof rootDir !== "string") continue
    const result = await projectDirectorySuggestionRead(rootDir, query)
    if (!result.success) {
      if (path.isAbsolute(query)) continue
      return result
    }
    for (const suggestion of result.data) {
      suggestions.set(suggestion.path, suggestion)
      if (suggestions.size >= projectDiscoveryLimits.maximumSuggestions) break
    }
    if (suggestions.size >= projectDiscoveryLimits.maximumSuggestions) break
  }

  return createResult(
    [...suggestions.values()].sort((left, right) => {
      const leftKey = left.label.toLocaleLowerCase()
      const rightKey = right.label.toLocaleLowerCase()
      if (leftKey < rightKey) return -1
      if (leftKey > rightKey) return 1
      return left.path.localeCompare(right.path)
    }),
  )
}

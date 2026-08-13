import * as fs from "node:fs/promises"
import * as path from "node:path"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { projectPathValidate } from "./projectPathValidate.js"

export interface ProjectResolvedPath {
  resolvedRoot: string
  targetAbsolutePath: string
  normalizedPath: string
  segments: string[]
}

export async function projectPathResolve(rootDir: string, relativePath: string): Promise<Result<ProjectResolvedPath>> {
  const op = "projectPathResolve"

  const validated = projectPathValidate(relativePath)
  if (!validated.success) {
    return validated
  }

  let resolvedRoot: string
  try {
    resolvedRoot = await fs.realpath(rootDir)
  } catch (_error) {
    return createResultError(op, "Repository root directory does not exist or is inaccessible")
  }

  try {
    const rootStat = await fs.lstat(resolvedRoot)
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      return createResultError(op, "Repository root is not a valid directory")
    }
  } catch (_error) {
    return createResultError(op, "Repository root directory could not be inspected")
  }

  const { normalizedPath, segments } = validated.data
  const targetAbsolutePath = path.resolve(resolvedRoot, ...segments)

  const relativeFromRoot = path.relative(resolvedRoot, targetAbsolutePath)
  if (relativeFromRoot.startsWith("..") || path.isAbsolute(relativeFromRoot) || relativeFromRoot === "..") {
    return createResultError(op, "Path escapes repository root")
  }

  const rootWithSep = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep
  if (targetAbsolutePath !== resolvedRoot && !targetAbsolutePath.startsWith(rootWithSep)) {
    return createResultError(op, "Path escapes repository root")
  }

  let currentPath = resolvedRoot
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i]
    if (!segment) continue
    currentPath = path.join(currentPath, segment)
    const currentRelative = segments.slice(0, i + 1).join("/")
    try {
      const stat = await fs.lstat(currentPath)
      if (stat.isSymbolicLink()) {
        return createResultError(op, `Path '${currentRelative}' contains a symbolic link`)
      }
      if (i < segments.length - 1 && !stat.isDirectory()) {
        return createResultError(op, `Path '${currentRelative}' is not a directory`)
      }
    } catch (_error) {
      return createResultError(op, `Path '${currentRelative}' does not exist`)
    }
  }

  return createResult({
    resolvedRoot,
    targetAbsolutePath,
    normalizedPath,
    segments,
  })
}

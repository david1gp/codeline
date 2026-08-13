import type { Stats } from "node:fs"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { ProjectMetadata } from "./projectMetadataSchema.js"
import { projectPathResolve } from "./projectPathResolve.js"

export async function projectMetadataRead(
  rootDir: string,
  relativePath: string = "",
): Promise<Result<ProjectMetadata>> {
  const op = "projectMetadataRead"

  const resolved = await projectPathResolve(rootDir, relativePath)
  if (!resolved.success) {
    return resolved
  }

  const { resolvedRoot, targetAbsolutePath, normalizedPath, segments } = resolved.data

  let targetStat: Stats
  try {
    targetStat = await fs.lstat(targetAbsolutePath)
  } catch (_error) {
    const displayPath = normalizedPath || "."
    return createResultError(op, `Path '${displayPath}' does not exist`)
  }

  if (targetStat.isSymbolicLink()) {
    const displayPath = normalizedPath || "."
    return createResultError(op, `Path '${displayPath}' is a symbolic link`)
  }

  let type: "directory" | "file" | "other" = "other"
  if (targetStat.isDirectory()) {
    type = "directory"
  } else if (targetStat.isFile()) {
    type = "file"
  }

  let name: string
  if (normalizedPath === "") {
    name = path.basename(resolvedRoot)
  } else {
    name = segments[segments.length - 1] ?? path.basename(normalizedPath)
  }

  const isReadOnly = (targetStat.mode & 0o222) === 0
  const createdAt = targetStat.birthtimeMs > 0 ? targetStat.birthtime : targetStat.ctime

  return createResult({
    path: normalizedPath,
    name,
    type,
    size: targetStat.size,
    modifiedAt: targetStat.mtime,
    createdAt,
    isReadOnly,
  })
}

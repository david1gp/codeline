import type { Dirent, Stats } from "node:fs"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { ProjectDirectoryEntry } from "./projectDirectoryEntrySchema.js"
import { projectDefaultLimits } from "./projectDefaultLimits.js"
import type { ProjectLimits } from "./projectLimitsSchema.js"
import { projectPathResolve } from "./projectPathResolve.js"

export async function projectDirectoryList(
  rootDir: string,
  relativePath: string = "",
  limits?: ProjectLimits,
): Promise<Result<ProjectDirectoryEntry[]>> {
  const op = "projectDirectoryList"

  const resolved = await projectPathResolve(rootDir, relativePath)
  if (!resolved.success) {
    return resolved
  }

  const { targetAbsolutePath, normalizedPath } = resolved.data

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

  if (!targetStat.isDirectory()) {
    const displayPath = normalizedPath || "."
    return createResultError(op, `Path '${displayPath}' is not a directory`)
  }

  let dirEntries: Dirent[]
  try {
    dirEntries = await fs.readdir(targetAbsolutePath, { withFileTypes: true })
  } catch (_error) {
    const displayPath = normalizedPath || "."
    return createResultError(op, `Failed to read directory '${displayPath}'`)
  }

  const maxEntries = limits?.maxDirectoryEntries ?? projectDefaultLimits.maxDirectoryEntries ?? 1000
  if (dirEntries.length > maxEntries) {
    const displayPath = normalizedPath || "."
    return createResultError(
      op,
      `Directory '${displayPath}' contains ${dirEntries.length} entries, exceeding limit of ${maxEntries}`,
    )
  }

  const entries: ProjectDirectoryEntry[] = []

  for (const dirEntry of dirEntries) {
    const entryAbsolutePath = path.join(targetAbsolutePath, dirEntry.name)
    const entryRelativePath = normalizedPath ? `${normalizedPath}/${dirEntry.name}` : dirEntry.name

    try {
      const entryStat = await fs.lstat(entryAbsolutePath)
      let entryType: "directory" | "file" | "other" = "other"
      if (entryStat.isSymbolicLink()) {
        entryType = "other"
      } else if (entryStat.isDirectory()) {
        entryType = "directory"
      } else if (entryStat.isFile()) {
        entryType = "file"
      }

      entries.push({
        name: dirEntry.name,
        path: entryRelativePath,
        type: entryType,
        size: entryStat.size,
        modifiedAt: entryStat.mtime,
      })
    } catch (_error) {
      // Ignore uninspectable entries
    }
  }

  entries.sort((a, b) => {
    if (a.type === "directory" && b.type !== "directory") return -1
    if (a.type !== "directory" && b.type === "directory") return 1

    const lowerA = a.name.toLowerCase()
    const lowerB = b.name.toLowerCase()
    if (lowerA < lowerB) return -1
    if (lowerA > lowerB) return 1

    return a.name.localeCompare(b.name)
  })

  return createResult(entries)
}

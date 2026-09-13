import * as fs from "node:fs/promises"
import * as path from "node:path"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"

export async function projectDirectoryCanonicalPathResolve(directoryPath: string): Promise<Result<string>> {
  const op = "projectDirectoryCanonicalPathResolve"
  if (typeof directoryPath !== "string" || !path.isAbsolute(directoryPath)) {
    return createResultError(op, "The project directory path is invalid.")
  }

  const absolutePath = path.resolve(directoryPath)
  try {
    const currentStat = await fs.lstat(absolutePath)
    if (currentStat.isSymbolicLink() || !currentStat.isDirectory()) {
      return createResultError(op, "The project directory is not a real directory.")
    }

    const canonicalPath = await fs.realpath(absolutePath)
    if (canonicalPath !== absolutePath) return createResultError(op, "The project directory contains a symbolic link.")

    const canonicalStat = await fs.lstat(canonicalPath)
    if (canonicalStat.isSymbolicLink() || !canonicalStat.isDirectory()) {
      return createResultError(op, "The project directory is not a real directory.")
    }

    return createResult(canonicalPath)
  } catch (_error) {
    return createResultError(op, "The project directory is unavailable.")
  }
}

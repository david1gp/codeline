import * as fs from "node:fs"
import * as fsPromises from "node:fs/promises"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { projectDefaultLimits } from "./projectDefaultLimits.js"
import type { ProjectLimits } from "./projectLimitsSchema.js"
import { projectPathResolve } from "./projectPathResolve.js"
import type { ProjectTextReadResult } from "./projectTextReadResultSchema.js"

export async function projectTextRead(
  rootDir: string,
  relativePath: string,
  limits?: ProjectLimits,
): Promise<Result<ProjectTextReadResult>> {
  const op = "projectTextRead"

  const resolved = await projectPathResolve(rootDir, relativePath)
  if (!resolved.success) {
    return resolved
  }

  const { targetAbsolutePath, normalizedPath } = resolved.data

  let handle: fsPromises.FileHandle
  try {
    handle = await fsPromises.open(targetAbsolutePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
  } catch (error: unknown) {
    const err = error as { code?: string }
    if (err?.code === "ELOOP" || err?.code === "EMLINK") {
      return createResultError(op, `Path '${normalizedPath}' is a symbolic link`)
    }
    if (err?.code === "ENOENT") {
      return createResultError(op, `Path '${normalizedPath}' does not exist`)
    }
    if (err?.code === "EISDIR") {
      return createResultError(op, `Path '${normalizedPath}' is not a regular file`)
    }
    return createResultError(op, `Failed to read file '${normalizedPath}'`)
  }

  try {
    const targetStat = await handle.stat()

    if (!targetStat.isFile()) {
      return createResultError(op, `Path '${normalizedPath}' is not a regular file`)
    }

    const maxBytes = limits?.maxTextFileSizeBytes ?? projectDefaultLimits.maxTextFileSizeBytes ?? 1024 * 1024
    if (targetStat.size > maxBytes) {
      return createResultError(
        op,
        `File '${normalizedPath}' size (${targetStat.size} bytes) exceeds limit of ${maxBytes} bytes`,
      )
    }

    let buffer: Buffer
    try {
      buffer = await handle.readFile()
    } catch (_error) {
      return createResultError(op, `Failed to read file '${normalizedPath}'`)
    }

    if (buffer.includes(0)) {
      return createResultError(op, `File '${normalizedPath}' contains binary content`)
    }

    let content: string
    try {
      const decoder = new TextDecoder("utf-8", { fatal: true })
      content = decoder.decode(buffer)
    } catch (_error) {
      return createResultError(op, `File '${normalizedPath}' contains invalid UTF-8 encoding`)
    }

    return createResult({
      path: normalizedPath,
      content,
      size: targetStat.size,
    })
  } finally {
    await handle.close()
  }
}

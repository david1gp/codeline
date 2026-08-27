import * as fs from "node:fs"
import * as fsPromises from "node:fs/promises"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { projectDefaultLimits } from "./projectDefaultLimits.js"
import type { ProjectDownloadDescriptorData } from "./projectDownloadDescriptorSchema.js"
import type { ProjectLimits } from "./projectLimitsSchema.js"
import { projectPathResolve } from "./projectPathResolve.js"

export interface ProjectDownloadDescriptor extends ProjectDownloadDescriptorData {
  createReadStream: () => fs.ReadStream
}

export async function projectDownloadPrepare(
  rootDir: string,
  relativePath: string,
  limits?: ProjectLimits,
): Promise<Result<ProjectDownloadDescriptor>> {
  const op = "projectDownloadPrepare"

  const resolved = await projectPathResolve(rootDir, relativePath)
  if (!resolved.success) {
    return resolved
  }

  const { targetAbsolutePath, normalizedPath, segments } = resolved.data

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
    return createResultError(op, `Failed to prepare download for '${normalizedPath}'`)
  }

  let targetStat: fs.Stats
  try {
    targetStat = await handle.stat()
  } finally {
    await handle.close()
  }

  if (targetStat.isSymbolicLink()) {
    return createResultError(op, `Path '${normalizedPath}' is a symbolic link`)
  }

  if (!targetStat.isFile()) {
    return createResultError(op, `Path '${normalizedPath}' is not a regular file`)
  }

  const maxBytes =
    limits?.maxDownloadFileSizeBytes ?? projectDefaultLimits.maxDownloadFileSizeBytes ?? 100 * 1024 * 1024
  if (targetStat.size > maxBytes) {
    return createResultError(
      op,
      `File '${normalizedPath}' size (${targetStat.size} bytes) exceeds download limit of ${maxBytes} bytes`,
    )
  }

  const name = segments[segments.length - 1] ?? normalizedPath

  return createResult({
    path: normalizedPath,
    name,
    size: targetStat.size,
    modifiedAt: targetStat.mtime,
    createReadStream: () =>
      fs.createReadStream(targetAbsolutePath, {
        flags: (fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW) as unknown as string,
      }),
  })
}

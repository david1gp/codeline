import * as fs from "node:fs"
import * as fsPromises from "node:fs/promises"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { projectDefaultLimits } from "./projectDefaultLimits.js"
import type { ProjectLimits } from "./projectLimitsSchema.js"
import { projectPathResolve } from "./projectPathResolve.js"
import { projectPreviewPolicyResolve } from "./projectPreviewPolicy.js"

export type ProjectPreviewDescriptor = {
  path: string
  name: string
  kind: "image" | "pdf"
  mimeType: string
  size: number
  modifiedAt: Date
  createReadStream: () => fs.ReadStream
}

export async function projectPreviewPrepare(
  rootDir: string,
  relativePath: string,
  limits?: ProjectLimits,
): Promise<Result<ProjectPreviewDescriptor>> {
  const op = "projectPreviewPrepare"
  const policy = projectPreviewPolicyResolve(relativePath)
  if (policy.kind !== "image" && policy.kind !== "pdf") {
    return createResultError(op, `File '${relativePath}' does not have a browser-safe preview`)
  }

  const resolved = await projectPathResolve(rootDir, relativePath)
  if (!resolved.success) return resolved

  const { targetAbsolutePath, normalizedPath, segments } = resolved.data
  let handle: fsPromises.FileHandle
  try {
    handle = await fsPromises.open(targetAbsolutePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
  } catch (error: unknown) {
    const err = error as { code?: string }
    if (err?.code === "ELOOP" || err?.code === "EMLINK") {
      return createResultError(op, `Path '${normalizedPath}' is a symbolic link`)
    }
    if (err?.code === "ENOENT") return createResultError(op, `Path '${normalizedPath}' does not exist`)
    if (err?.code === "EISDIR") return createResultError(op, `Path '${normalizedPath}' is not a regular file`)
    return createResultError(op, `Failed to prepare preview for '${normalizedPath}'`)
  }

  let targetStat: fs.Stats
  try {
    targetStat = await handle.stat()
  } catch (_error) {
    return createResultError(op, `Failed to prepare preview for '${normalizedPath}'`)
  } finally {
    await handle.close().catch(() => undefined)
  }

  if (targetStat.isSymbolicLink()) return createResultError(op, `Path '${normalizedPath}' is a symbolic link`)
  if (!targetStat.isFile()) return createResultError(op, `Path '${normalizedPath}' is not a regular file`)

  const maxBytes = limits?.maxPreviewFileSizeBytes ?? projectDefaultLimits.maxPreviewFileSizeBytes ?? 10 * 1024 * 1024
  if (targetStat.size > maxBytes) {
    return createResultError(
      op,
      `File '${normalizedPath}' size (${targetStat.size} bytes) exceeds preview limit of ${maxBytes} bytes`,
    )
  }

  return createResult({
    path: normalizedPath,
    name: segments[segments.length - 1] ?? normalizedPath,
    kind: policy.kind,
    mimeType: policy.mimeType,
    size: targetStat.size,
    modifiedAt: targetStat.mtime,
    createReadStream: () =>
      fs.createReadStream(targetAbsolutePath, {
        flags: (fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW) as unknown as string,
      }),
  })
}

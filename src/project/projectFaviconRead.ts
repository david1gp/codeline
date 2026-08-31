import * as fs from "node:fs"
import * as fsPromises from "node:fs/promises"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { projectFaviconMetadataResolve } from "./projectFaviconMetadataResolve.js"
import { projectPathResolve } from "./projectPathResolve.js"

type ProjectFaviconReadResult = {
  modifiedAt: Date
  size: number
  stream: fs.ReadStream
}

export async function projectFaviconRead(authorizedProjectRoot: string): Promise<Result<ProjectFaviconReadResult>> {
  const op = "projectFaviconRead"
  const resolved = await projectPathResolve(authorizedProjectRoot, "public/favicon.ico")
  if (!resolved.success) {
    return createResultError(op, "The project favicon is unavailable.")
  }

  let currentStat: fs.Stats
  try {
    currentStat = await fsPromises.lstat(resolved.data.targetAbsolutePath)
  } catch (_error) {
    return createResultError(op, "The project favicon is unavailable.")
  }
  if (!currentStat.isFile()) return createResultError(op, "The project favicon is unavailable.")

  const metadata = await projectFaviconMetadataResolve(authorizedProjectRoot)
  if (!metadata.success || metadata.data === null || resolved.data.targetAbsolutePath !== metadata.data.path) {
    return createResultError(op, "The project favicon is unavailable.")
  }

  let handle: fsPromises.FileHandle
  try {
    handle = await fsPromises.open(resolved.data.targetAbsolutePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
  } catch (_error) {
    return createResultError(op, "The project favicon is unavailable.")
  }

  try {
    const faviconStat = await handle.stat()
    if (!faviconStat.isFile()) {
      await handle.close().catch(() => undefined)
      return createResultError(op, "The project favicon is unavailable.")
    }

    return createResult({
      modifiedAt: faviconStat.mtime,
      size: faviconStat.size,
      stream: handle.createReadStream(),
    })
  } catch (_error) {
    await handle.close().catch(() => undefined)
    return createResultError(op, "The project favicon is unavailable.")
  }
}

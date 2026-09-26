import * as fs from "node:fs"
import * as fsPromises from "node:fs/promises"
import * as path from "node:path"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"

type ProjectFaviconMetadata = {
  path: string
  size: number
  modifiedAt: Date
  revision: string
}

type ProjectFaviconMetadataCacheEntry = {
  expiresAt: number
  result: Result<ProjectFaviconMetadata | null>
}

type ProjectFaviconMetadataResolveOptions = {
  now?: () => number
}

const projectFaviconMetadataCache = new Map<string, ProjectFaviconMetadataCacheEntry>()
const projectFaviconMetadataCacheTtlMs = 24 * 60 * 60 * 1_000

function projectFaviconMetadataRevisionCreate(mtimeNs: bigint, size: bigint): string {
  return `${mtimeNs.toString(36)}-${size.toString(36)}`
}

function projectFaviconMetadataUnavailable(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return (
    code === "EACCES" ||
    code === "EISDIR" ||
    code === "ELOOP" ||
    code === "EMLINK" ||
    code === "ENOENT" ||
    code === "ENOTDIR" ||
    code === "EPERM"
  )
}

export async function projectFaviconMetadataResolve(
  authorizedProjectRoot: string,
  options: ProjectFaviconMetadataResolveOptions = {},
): Promise<Result<ProjectFaviconMetadata | null>> {
  const op = "projectFaviconMetadataResolve"
  if (!path.isAbsolute(authorizedProjectRoot)) return createResultError(op, "The authorized project path is invalid.")

  const cacheKey = path.resolve(authorizedProjectRoot)
  const now = options.now ?? Date.now
  const currentTime = now()
  const cached = projectFaviconMetadataCache.get(cacheKey)
  if (cached !== undefined && cached.expiresAt > currentTime) return cached.result
  if (cached !== undefined) projectFaviconMetadataCache.delete(cacheKey)

  const faviconPath = path.join(cacheKey, "public", "favicon.ico")
  const publicPath = path.dirname(faviconPath)
  let publicStat: fs.Stats
  try {
    publicStat = await fsPromises.lstat(publicPath)
  } catch (error: unknown) {
    if (projectFaviconMetadataUnavailable(error)) return projectFaviconMetadataCacheSet(cacheKey, null, now)
    return createResultError(op, "The project favicon could not be inspected.")
  }
  if (publicStat.isSymbolicLink() || !publicStat.isDirectory()) {
    return projectFaviconMetadataCacheSet(cacheKey, null, now)
  }

  let handle: fsPromises.FileHandle
  try {
    handle = await fsPromises.open(faviconPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
  } catch (error: unknown) {
    if (projectFaviconMetadataUnavailable(error)) return projectFaviconMetadataCacheSet(cacheKey, null, now)
    return createResultError(op, "The project favicon could not be inspected.")
  }

  try {
    const faviconStat = await handle.stat({ bigint: true })
    if (!faviconStat.isFile()) return projectFaviconMetadataCacheSet(cacheKey, null, now)

    const result = createResult({
      path: faviconPath,
      size: Number(faviconStat.size),
      modifiedAt: faviconStat.mtime,
      revision: projectFaviconMetadataRevisionCreate(faviconStat.mtimeNs, faviconStat.size),
    })
    return projectFaviconMetadataCacheSet(cacheKey, result.data, now)
  } catch (error: unknown) {
    if (projectFaviconMetadataUnavailable(error)) return projectFaviconMetadataCacheSet(cacheKey, null, now)
    return createResultError(op, "The project favicon could not be inspected.")
  } finally {
    await handle.close().catch(() => undefined)
  }
}

function projectFaviconMetadataCacheSet(
  cacheKey: string,
  metadata: ProjectFaviconMetadata | null,
  now: () => number,
): Result<ProjectFaviconMetadata | null> {
  const result = createResult(metadata)
  projectFaviconMetadataCache.set(cacheKey, {
    expiresAt: now() + projectFaviconMetadataCacheTtlMs,
    result,
  })
  return result
}

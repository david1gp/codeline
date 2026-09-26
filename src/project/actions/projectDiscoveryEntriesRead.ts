import * as crypto from "node:crypto"
import type { Dir, Dirent } from "node:fs"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { projectDiscoveryLimits } from "./projectDiscoveryLimits.js"
import { projectPathValidate } from "./projectPathValidate.js"

export type ProjectDiscoveryEntriesReadOptions = {
  maxProjects?: number
}

export type ProjectDiscoveryEntry = {
  canonicalPath: string
  id: string
  name: string
}

export type ProjectDiscoveryEntriesReadResult = {
  entries: ProjectDiscoveryEntry[]
  truncated: boolean
}

function projectPathSort(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function projectDiscoveryMaximumProjectsResolve(options: ProjectDiscoveryEntriesReadOptions): Result<number> {
  const op = "projectDiscoveryEntriesRead"
  const requested = options.maxProjects ?? projectDiscoveryLimits.maximumProjects
  if (!Number.isSafeInteger(requested) || requested < 0) {
    return createResultError(op, "The project discovery limit is invalid.")
  }

  return createResult(Math.min(requested, projectDiscoveryLimits.maximumProjects))
}

async function projectDiscoveryRootCanonicalize(rootDir: string): Promise<string | undefined> {
  if (rootDir.trim() === "") return undefined

  let rootPath: string
  try {
    rootPath = path.resolve(rootDir)
  } catch (_error) {
    return undefined
  }

  try {
    const rootStat = await fs.lstat(rootPath)
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) return undefined

    const canonicalPath = await fs.realpath(rootPath)
    const currentRootStat = await fs.lstat(rootPath)
    if (currentRootStat.isSymbolicLink() || !currentRootStat.isDirectory()) return undefined
    const canonicalStat = await fs.lstat(canonicalPath)
    if (canonicalStat.isSymbolicLink() || !canonicalStat.isDirectory()) return undefined
    return canonicalPath
  } catch (_error) {
    return undefined
  }
}

function projectPathIsWithin(rootDir: string, targetPath: string): boolean {
  const relativePath = path.relative(rootDir, targetPath)
  return (
    relativePath !== "" &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  )
}

async function projectDiscoveryDirectoryEntriesRead(
  rootDir: string,
): Promise<{ entries: Dirent[]; truncated: boolean } | undefined> {
  let directory: Dir
  try {
    directory = await fs.opendir(rootDir)
  } catch (_error) {
    return undefined
  }

  const entries: Dirent[] = []
  let scannedEntries = 0
  try {
    for (;;) {
      const entry = await directory.read()
      if (entry === null || entry === undefined) {
        return { entries, truncated: scannedEntries > projectDiscoveryLimits.maximumEntriesPerRoot }
      }
      scannedEntries += 1
      if (entry.isSymbolicLink() || !entry.isDirectory()) continue
      if (entries.length >= projectDiscoveryLimits.maximumEntriesPerRoot) return { entries, truncated: true }
      entries.push(entry)
    }
  } catch (_error) {
    return undefined
  } finally {
    try {
      await directory.close()
    } catch (_error) {
      // The candidate list is bounded and can be discarded if closing fails.
    }
  }
}

function projectIdCreate(canonicalPath: string): string {
  return crypto.createHash("sha256").update("codeline-project\0", "utf8").update(canonicalPath, "utf8").digest("hex")
}

async function projectDiscoveryChildCanonicalize(rootDir: string, name: string): Promise<string | undefined> {
  const validated = projectPathValidate(name)
  if (!validated.success || validated.data.normalizedPath !== name) return undefined

  const targetAbsolutePath = path.join(rootDir, name)

  try {
    const targetStat = await fs.lstat(targetAbsolutePath)
    if (targetStat.isSymbolicLink() || !targetStat.isDirectory()) return undefined

    const canonicalPath = await fs.realpath(targetAbsolutePath)
    const currentTargetStat = await fs.lstat(targetAbsolutePath)
    if (currentTargetStat.isSymbolicLink() || !currentTargetStat.isDirectory()) return undefined
    const canonicalStat = await fs.lstat(canonicalPath)
    if (canonicalStat.isSymbolicLink() || !canonicalStat.isDirectory()) return undefined
    if (!projectPathIsWithin(rootDir, canonicalPath)) return undefined
    return canonicalPath
  } catch (_error) {
    return undefined
  }
}

export async function projectDiscoveryEntriesRead(
  rootDirs: readonly string[],
  options: ProjectDiscoveryEntriesReadOptions = {},
): Promise<Result<ProjectDiscoveryEntriesReadResult>> {
  const maximum = projectDiscoveryMaximumProjectsResolve(options)
  if (!maximum.success) return maximum
  if (maximum.data === 0) return createResult({ entries: [], truncated: false })

  const candidates = new Set<string>()
  const canonicalRoots = new Set<string>()
  let truncated = rootDirs.length > projectDiscoveryLimits.maximumRoots

  for (const rootDir of rootDirs.slice(0, projectDiscoveryLimits.maximumRoots)) {
    if (typeof rootDir !== "string") continue
    const canonicalRoot = await projectDiscoveryRootCanonicalize(rootDir)
    if (canonicalRoot === undefined || canonicalRoots.has(canonicalRoot)) continue
    canonicalRoots.add(canonicalRoot)

    const dirEntries = await projectDiscoveryDirectoryEntriesRead(canonicalRoot)
    if (dirEntries === undefined) continue
    truncated ||= dirEntries.truncated

    dirEntries.entries.sort((left, right) => projectPathSort(left.name, right.name))
    for (const dirEntry of dirEntries.entries) {
      if (dirEntry.isSymbolicLink() || !dirEntry.isDirectory()) continue
      const canonicalPath = await projectDiscoveryChildCanonicalize(canonicalRoot, dirEntry.name)
      if (canonicalPath === undefined) continue
      candidates.add(canonicalPath)
    }
  }

  const canonicalPaths = [...candidates].sort(projectPathSort).slice(0, maximum.data)
  truncated ||= candidates.size > canonicalPaths.length
  return createResult({
    entries: canonicalPaths.map((canonicalPath) => ({
      canonicalPath,
      id: projectIdCreate(canonicalPath),
      name: path.basename(canonicalPath),
    })),
    truncated,
  })
}

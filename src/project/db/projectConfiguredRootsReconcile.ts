import type { Dir } from "node:fs"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { projectDirectoryCanonicalPathResolve } from "../projectDirectoryCanonicalPathResolve.js"
import type { ProjectDiscoveryEntry } from "../projectDiscoveryEntriesRead.js"
import { projectDiscoveryEntriesRead } from "../projectDiscoveryEntriesRead.js"
import { projectDiscoveryLimits } from "../projectDiscoveryLimits.js"
import { projectFolderBootstrapKeyResolve } from "../projectFolderBootstrapKeyResolve.js"
import { projectFolderTable } from "./projectFolderTable.js"
import { type Project, projectTable } from "./projectTable.js"

type ProjectConfiguredRootEntry = Pick<ProjectDiscoveryEntry, "canonicalPath" | "name"> & {
  authorizationPath: string | null
}

async function projectConfiguredRootFolderIdResolve(
  database: DatabaseExecutor,
  userId: string,
  rootPath: string,
): Promise<Result<string>> {
  const op = "projectConfiguredRootFolderIdResolve"
  const folderName = path.basename(rootPath) || rootPath
  const bootstrapKey = await projectFolderBootstrapKeyResolve(rootPath, [rootPath])

  try {
    if (bootstrapKey !== undefined) {
      const [bootstrapFolder] = await database
        .select({ id: projectFolderTable.id })
        .from(projectFolderTable)
        .where(and(eq(projectFolderTable.userId, userId), eq(projectFolderTable.bootstrapKey, bootstrapKey)))
        .limit(1)
      if (bootstrapFolder !== undefined) return createResult(bootstrapFolder.id)
    }

    const [namedFolder] = await database
      .select({ id: projectFolderTable.id })
      .from(projectFolderTable)
      .where(and(eq(projectFolderTable.userId, userId), eq(projectFolderTable.name, folderName)))
      .limit(1)
    if (namedFolder !== undefined) return createResult(namedFolder.id)

    const [createdFolder] = await database
      .insert(projectFolderTable)
      .values({
        bootstrapKey: bootstrapKey ?? null,
        id: uuidv7(),
        name: folderName,
        userId,
      })
      .returning({ id: projectFolderTable.id })
    if (createdFolder !== undefined) return createResult(createdFolder.id)

    const [reconciledFolder] = await database
      .select({ id: projectFolderTable.id })
      .from(projectFolderTable)
      .where(and(eq(projectFolderTable.userId, userId), eq(projectFolderTable.name, folderName)))
      .limit(1)
    if (reconciledFolder === undefined)
      return createResultError(op, "The configured project folder could not be created.")
    return createResult(reconciledFolder.id)
  } catch (_error) {
    return createResultError(op, "The configured project folder could not be reconciled.")
  }
}

async function projectConfiguredRootProjectReconcile(
  database: DatabaseExecutor,
  userId: string,
  projectPath: string,
  authorizationPath: string | null,
  parentFolderId: string,
): Promise<Result<Project>> {
  const op = "projectConfiguredRootProjectReconcile"

  try {
    const [existing] = await database
      .select()
      .from(projectTable)
      .where(and(eq(projectTable.userId, userId), eq(projectTable.path, projectPath)))
      .limit(1)
    if (existing !== undefined) {
      if (existing.authorizationPath === authorizationPath && existing.parentFolderId === parentFolderId)
        return createResult(existing)
      const [updated] = await database
        .update(projectTable)
        .set({ authorizationPath, parentFolderId, updatedAt: new Date() })
        .where(and(eq(projectTable.userId, userId), eq(projectTable.id, existing.id)))
        .returning()
      if (updated !== undefined) return createResult(updated)
      return createResultError(op, "The configured project could not be reconciled.")
    }

    const now = new Date()
    const [created] = await database
      .insert(projectTable)
      .values({
        createdAt: now,
        displayName: null,
        id: uuidv7(),
        parentFolderId,
        path: projectPath,
        authorizationPath,
        updatedAt: now,
        userId,
      })
      .returning()
    if (created === undefined) return createResultError(op, "The configured project could not be created.")
    return createResult(created)
  } catch (_error) {
    return createResultError(op, "The configured project could not be reconciled.")
  }
}

function projectPathWithinBoundary(boundaryPath: string, targetPath: string): boolean {
  const relativePath = path.relative(boundaryPath, targetPath)
  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${path.sep}`) && relativePath !== ".." && !path.isAbsolute(relativePath))
  )
}

async function projectConfiguredRootSymlinkEntriesRead(rootPath: string): Promise<ProjectConfiguredRootEntry[]> {
  const homePath = await fs.realpath(os.homedir()).catch(() => undefined)
  if (homePath === undefined) return []

  let directory: Dir
  try {
    directory = await fs.opendir(rootPath)
  } catch (_error) {
    return []
  }

  const entries: ProjectConfiguredRootEntry[] = []
  try {
    for (;;) {
      const entry = await directory.read()
      if (entry === null || entry === undefined) break
      if (!entry.isSymbolicLink() || entries.length >= projectDiscoveryLimits.maximumEntriesPerRoot) continue

      const entryPath = path.join(rootPath, entry.name)
      try {
        const linkStat = await fs.lstat(entryPath)
        if (!linkStat.isSymbolicLink()) continue
        const canonicalPath = await fs.realpath(entryPath)
        const currentLinkStat = await fs.lstat(entryPath)
        if (!currentLinkStat.isSymbolicLink()) continue
        const canonicalStat = await fs.lstat(canonicalPath)
        if (canonicalStat.isSymbolicLink() || !canonicalStat.isDirectory()) continue
        if (!projectPathWithinBoundary(homePath, canonicalPath)) continue
        entries.push({ authorizationPath: entryPath, canonicalPath, name: path.basename(canonicalPath) })
      } catch (_error) {
        // A disappearing or changing symlink is not a project candidate.
      }
    }
  } finally {
    try {
      await directory.close()
    } catch (_error) {
      // The bounded candidate list can be discarded if closing fails.
    }
  }

  return entries.sort((left, right) => (left.authorizationPath ?? "").localeCompare(right.authorizationPath ?? ""))
}

async function projectConfiguredRootEntriesRead(rootPath: string): Promise<Result<ProjectConfiguredRootEntry[]>> {
  const op = "projectConfiguredRootEntriesRead"
  const discovered = await projectDiscoveryEntriesRead([rootPath])
  if (!discovered.success) return createResultError(op, discovered.errorMessage)

  const entries = new Map<string, ProjectConfiguredRootEntry>(
    discovered.data.entries.map(({ canonicalPath, name }) => [
      canonicalPath,
      { authorizationPath: null, canonicalPath, name },
    ]),
  )
  for (const entry of await projectConfiguredRootSymlinkEntriesRead(rootPath)) {
    if (!entries.has(entry.canonicalPath)) entries.set(entry.canonicalPath, entry)
  }

  return createResult(
    [...entries.values()].sort((left, right) => left.canonicalPath.localeCompare(right.canonicalPath)),
  )
}

export async function projectConfiguredRootsReconcile(
  database: DatabaseExecutor,
  userId: string,
  rootDirs: readonly string[],
): Promise<Result<Project[]>> {
  const op = "projectConfiguredRootsReconcile"

  try {
    const reconciledRoots = new Set<string>()
    const projectsByPath = new Map<string, Project>()
    for (const rootDir of rootDirs) {
      const canonicalRoot = await projectDirectoryCanonicalPathResolve(rootDir)
      if (!canonicalRoot.success || reconciledRoots.has(canonicalRoot.data)) continue
      reconciledRoots.add(canonicalRoot.data)

      const folder = await projectConfiguredRootFolderIdResolve(database, userId, canonicalRoot.data)
      if (!folder.success) return createResultError(op, folder.errorMessage)

      const discovered = await projectConfiguredRootEntriesRead(canonicalRoot.data)
      if (!discovered.success) return createResultError(op, discovered.errorMessage)
      for (const entry of discovered.data) {
        const project = await projectConfiguredRootProjectReconcile(
          database,
          userId,
          entry.canonicalPath,
          entry.authorizationPath,
          folder.data,
        )
        if (!project.success) return createResultError(op, project.errorMessage)
        projectsByPath.set(project.data.path, project.data)
      }
    }

    return createResult([...projectsByPath.values()].sort((left, right) => left.path.localeCompare(right.path)))
  } catch (_error) {
    return createResultError(op, "The configured project roots could not be reconciled.")
  }
}

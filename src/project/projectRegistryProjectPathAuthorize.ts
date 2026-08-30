import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { Project } from "./db/projectTable.js"
import { projectDirectoryCanonicalPathResolve } from "./projectDirectoryCanonicalPathResolve.js"
import { projectRegistryPathCanonicalize } from "./projectRegistryPathCanonicalize.js"

function projectPathWithinBoundary(boundaryPath: string, targetPath: string): boolean {
  const relativePath = path.relative(boundaryPath, targetPath)
  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${path.sep}`) && relativePath !== ".." && !path.isAbsolute(relativePath))
  )
}

async function projectAuthorizationRootIsConfigured(
  authorizationPath: string,
  rootDirs: readonly string[],
): Promise<boolean> {
  for (const rootDir of rootDirs) {
    const root = await projectDirectoryCanonicalPathResolve(rootDir)
    if (!root.success) continue
    const relativePath = path.relative(root.data, authorizationPath)
    if (relativePath !== "" && !relativePath.includes(path.sep) && relativePath !== "..") return true
  }
  return false
}

export async function projectRegistryProjectPathAuthorize(
  project: Pick<Project, "authorizationPath" | "path">,
  rootDirs: readonly string[],
): Promise<Result<string>> {
  const op = "projectRegistryProjectPathAuthorize"
  if (project.authorizationPath === null) {
    const canonical = await projectRegistryPathCanonicalize(project.path, rootDirs)
    if (!canonical.success) return createResultError(op, "The project path is unavailable.")
    return canonical
  }

  if (
    !path.isAbsolute(project.authorizationPath) ||
    path.resolve(project.authorizationPath) !== project.authorizationPath ||
    !(await projectAuthorizationRootIsConfigured(project.authorizationPath, rootDirs))
  ) {
    return createResultError(op, "The project path is unavailable.")
  }

  const homePath = await fs.realpath(os.homedir()).catch(() => undefined)
  if (homePath === undefined) return createResultError(op, "The project path is unavailable.")

  const canonical = await projectDirectoryCanonicalPathResolve(project.path)
  if (!canonical.success || !projectPathWithinBoundary(homePath, canonical.data))
    return createResultError(op, "The project path is unavailable.")

  try {
    const linkStat = await fs.lstat(project.authorizationPath)
    if (!linkStat.isSymbolicLink()) return createResultError(op, "The project path is unavailable.")
    const targetPath = await fs.realpath(project.authorizationPath)
    const currentLinkStat = await fs.lstat(project.authorizationPath)
    if (!currentLinkStat.isSymbolicLink() || targetPath !== canonical.data)
      return createResultError(op, "The project path is unavailable.")
    const targetStat = await fs.lstat(targetPath)
    if (targetStat.isSymbolicLink() || !targetStat.isDirectory())
      return createResultError(op, "The project path is unavailable.")
    if (!projectPathWithinBoundary(homePath, targetPath))
      return createResultError(op, "The project path is unavailable.")
    const finalLinkStat = await fs.lstat(project.authorizationPath)
    const finalTargetPath = await fs.realpath(project.authorizationPath)
    if (!finalLinkStat.isSymbolicLink() || finalTargetPath !== canonical.data)
      return createResultError(op, "The project path is unavailable.")
    if (!(await projectAuthorizationRootIsConfigured(project.authorizationPath, rootDirs)))
      return createResultError(op, "The project path is unavailable.")
  } catch (_error) {
    return createResultError(op, "The project path is unavailable.")
  }

  return createResult(canonical.data)
}

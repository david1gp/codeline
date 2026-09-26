import { constants } from "node:fs"
import * as fs from "node:fs/promises"
import path from "node:path"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { exampleDataFixture } from "../../database/exampleDataFixture.js"

type Operation = "issue" | "status" | "purge-status" | "remove" | "rollback"

/** Owns only the named, newly created clone directories, never their shared source directories. */
export async function e2eSampleProjectPathsOperate(
  runId: string,
  mapping: Record<string, string>,
  operation: Operation,
  createdPaths: string[] = [],
): Promise<Result<void>> {
  const op = "e2eSampleProjectPathsOperate"
  const paths = exampleDataFixture.projects.map((project) => ({
    source: project.path,
    target:
      mapping[`path:${project.path}`] ?? (operation === "rollback" ? path.join(project.path, `.e2e-${runId}`) : ""),
  }))
  if (
    !/^[0-9a-z]{6,40}$/.test(runId) ||
    paths.some(({ source, target }) => target !== path.join(source, `.e2e-${runId}`))
  )
    return createResultError(op, "The sample project path manifest is invalid.")

  try {
    if (operation === "rollback") {
      for (const target of createdPaths) {
        if (!paths.some((item) => item.target === target))
          return createResultError(op, "The created project path is not in the manifest.")
        if (!(await fs.lstat(target)).isDirectory() || (await fs.realpath(target)) !== target)
          return createResultError(op, "The created project path changed.")
        const entries = await fs.readdir(target)
        if (entries.some((entry) => entry !== ".e2e-owner" && entry !== "README.md"))
          return createResultError(op, "The created project path contains unowned entries.")
        if (entries.includes(".e2e-owner")) {
          const marker = path.join(target, ".e2e-owner")
          if (!(await fs.lstat(marker)).isFile() || (await fs.readFile(marker, "utf8")) !== runId)
            return createResultError(op, "The created project path changed ownership.")
        }
        if (entries.includes("README.md") && !(await fs.lstat(path.join(target, "README.md"))).isFile())
          return createResultError(op, "The created project path changed ownership.")
        if (entries.includes("README.md")) await fs.unlink(path.join(target, "README.md"))
        if (entries.includes(".e2e-owner")) await fs.unlink(path.join(target, ".e2e-owner"))
        await fs.rmdir(target)
        if (
          await fs.lstat(target).then(
            () => true,
            () => false,
          )
        )
          return createResultError(op, "The created project path was not removed.")
      }
      return createResult(undefined)
    }
    const presentTargets: string[] = []
    for (const { source, target } of paths) {
      const sourceStat = await fs.lstat(source)
      if (!sourceStat.isDirectory() || (await fs.realpath(source)) !== source)
        return createResultError(op, "The sample project source is unavailable.")
      const sourceReadme = path.join(source, "README.md")
      const readmeStat = await fs.lstat(sourceReadme)
      if (!readmeStat.isFile()) return createResultError(op, "The sample project source is unavailable.")
      if (operation === "issue") {
        // Exclusive creation refuses to adopt a shared or previously occupied path.
        await fs.mkdir(target)
        createdPaths.push(target)
        await fs.writeFile(path.join(target, ".e2e-owner"), runId, { flag: "wx" })
        await fs.copyFile(sourceReadme, path.join(target, "README.md"), constants.COPYFILE_EXCL)
      }
      const stat = await fs.lstat(target).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT" && (operation === "purge-status" || operation === "remove")) return undefined
        throw error
      })
      if (stat === undefined) continue
      presentTargets.push(target)
      if (!stat.isDirectory() || (await fs.realpath(target)) !== target)
        return createResultError(op, "The sample project directory is not owned by this run.")
      const entries = (await fs.readdir(target)).sort()
      if (entries.join("\0") !== [".e2e-owner", "README.md"].join("\0"))
        return createResultError(op, "The sample project directory contains unowned entries.")
      const marker = path.join(target, ".e2e-owner")
      const readme = path.join(target, "README.md")
      if (
        !(await fs.lstat(marker)).isFile() ||
        !(await fs.lstat(readme)).isFile() ||
        (await fs.readFile(marker, "utf8")) !== runId ||
        !(await fs.readFile(readme)).equals(await fs.readFile(sourceReadme))
      )
        return createResultError(op, "The sample project directory is not readable or owned by this run.")
    }
    if (operation === "remove") {
      for (const target of presentTargets) {
        await fs.unlink(path.join(target, "README.md"))
        await fs.unlink(path.join(target, ".e2e-owner"))
        await fs.rmdir(target)
      }
      for (const { target } of paths) {
        const remaining = await fs.lstat(target).catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return undefined
          throw error
        })
        if (remaining !== undefined) return createResultError(op, "The sample project directory was not removed.")
      }
    }
    return createResult(undefined)
  } catch (_error) {
    // Do not recursively delete: foreign entries or swapped symlinks must remain untouched.
    return createResultError(op, "The sample project filesystem operation failed.")
  }
}

import * as os from "node:os"
import * as path from "node:path"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { projectDirectoryCanonicalPathResolve } from "./projectDirectoryCanonicalPathResolve.js"

export async function projectPathReferenceResolve(
  projectPath: string | undefined,
  rootDirs: readonly string[],
): Promise<Result<string>> {
  const op = "projectPathReferenceResolve"
  const requestedPath = projectPath ?? "~"

  if (requestedPath === "~") {
    const home = await projectDirectoryCanonicalPathResolve(path.resolve(os.homedir()))
    if (!home.success) return createResultError(op, "The session project path is invalid.")
    return createResult("~")
  }

  if (!path.isAbsolute(requestedPath)) return createResultError(op, "The session project path is invalid.")
  const canonical = await projectDirectoryCanonicalPathResolve(requestedPath)
  if (!canonical.success) return createResultError(op, "The session project path is invalid.")

  for (const rootDir of rootDirs) {
    const root = await projectDirectoryCanonicalPathResolve(rootDir)
    if (!root.success) continue
    const relativePath = path.relative(root.data, canonical.data)
    if (relativePath === "" || (!relativePath.startsWith(`..${path.sep}`) && relativePath !== "..")) {
      return createResult(canonical.data)
    }
  }

  return createResultError(op, "The session project path is invalid.")
}

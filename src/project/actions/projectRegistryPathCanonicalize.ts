import * as path from "node:path"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { projectDirectoryCanonicalPathResolve } from "./projectDirectoryCanonicalPathResolve.js"

export async function projectRegistryPathCanonicalize(
  projectPath: string,
  rootDirs: readonly string[],
): Promise<Result<string>> {
  const op = "projectRegistryPathCanonicalize"
  if (typeof projectPath !== "string" || !path.isAbsolute(projectPath)) {
    return createResultError(op, "The project path is invalid.")
  }

  const canonical = await projectDirectoryCanonicalPathResolve(projectPath)
  if (!canonical.success) return createResultError(op, "The project path is invalid.")

  for (const rootDir of rootDirs) {
    const root = await projectDirectoryCanonicalPathResolve(rootDir)
    if (!root.success) continue

    const relativePath = path.relative(root.data, canonical.data)
    if (relativePath === "" || (!relativePath.startsWith(`..${path.sep}`) && relativePath !== "..")) {
      return createResult(canonical.data)
    }
  }

  return createResultError(op, "The project path is invalid.")
}

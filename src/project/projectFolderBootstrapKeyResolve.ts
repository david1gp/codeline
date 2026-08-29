import * as path from "node:path"
import { projectDirectoryCanonicalPathResolve } from "./projectDirectoryCanonicalPathResolve.js"
import type { ProjectFolderBootstrapKey } from "./projectFolderBootstrapKeySchema.js"

type CanonicalRoot = {
  index: number
  key: ProjectFolderBootstrapKey | undefined
  path: string
}

function projectFolderBootstrapKeyFromName(name: string): ProjectFolderBootstrapKey | undefined {
  const normalized = name.toLowerCase()
  if (/(^|[-_.])adaptive($|[-_.])/.test(normalized)) return "adaptive"
  if (/(^|[-_.])leo($|[-_.])/.test(normalized)) return "leo"
  if (/(^|[-_.])personal($|[-_.])/.test(normalized)) return "personal"
  return undefined
}

function projectPathWithinRoot(projectPath: string, rootPath: string): boolean {
  const relativePath = path.relative(rootPath, projectPath)
  return relativePath === "" || (!relativePath.startsWith(`..${path.sep}`) && relativePath !== "..")
}

export async function projectFolderBootstrapKeyResolve(
  projectPath: string,
  rootDirs: readonly string[],
): Promise<ProjectFolderBootstrapKey | undefined> {
  if (!path.isAbsolute(projectPath)) return undefined

  const roots = await Promise.all(
    rootDirs.map(async (rootDir, index): Promise<CanonicalRoot | undefined> => {
      const canonical = await projectDirectoryCanonicalPathResolve(rootDir)
      if (!canonical.success) return undefined
      return { index, key: projectFolderBootstrapKeyFromName(path.basename(canonical.data)), path: canonical.data }
    }),
  )
  const matchingRoots = roots
    .filter(
      (root): root is CanonicalRoot =>
        root !== undefined && projectPathWithinRoot(path.resolve(projectPath), root.path),
    )
    .sort((left, right) => right.path.length - left.path.length || left.index - right.index)
  const root = matchingRoots[0]
  if (root === undefined) return undefined
  if (root.key !== undefined) return root.key

  const relativePath = path.relative(root.path, path.resolve(projectPath))
  return projectFolderBootstrapKeyFromName(relativePath.split(path.sep)[0] ?? "")
}

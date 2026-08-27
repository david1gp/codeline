type SessionResourceSkillTreeSkill = {
  bundlePath: string
  description: string
  name: string
  source: "global" | "project"
}

type SessionResourceSkillTreeGroup = {
  path: string
  source: "global" | "project"
}

type SessionResourceSkillTreeDeriveInput = {
  activeSkillNames: readonly string[]
  excludedSkillNames: readonly string[]
  groups: readonly SessionResourceSkillTreeGroup[]
  skills: readonly SessionResourceSkillTreeSkill[]
}

export type SessionResourceSkillTreeSkillNode = {
  bundlePath: string
  description: string
  /** A preset exclusion always wins, so the individual toggle is not offered. */
  isExcluded: boolean
  isActive: boolean
  name: string
  source: "global" | "project"
}

export type SessionResourceSkillTreeFolderNode = {
  /** Depth below its root, so the view can indent without parsing paths. */
  depth: number
  label: string
  path: string
  /** Every skill at or below this folder, so a parent toggle recurses. */
  descendantSkillNames: readonly string[]
  selection: "all" | "none" | "partial"
  skills: readonly SessionResourceSkillTreeSkillNode[]
  source: "global" | "project"
}

function sessionResourceSkillTreePathSort(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function sessionResourceSkillTreeFolderMatches(folderPath: string, bundlePath: string): boolean {
  return bundlePath === folderPath || bundlePath.startsWith(`${folderPath}/`)
}

function sessionResourceSkillTreeLabelCreate(folderPath: string): string {
  const segments = folderPath.split("/").filter((segment) => segment.length > 0)
  return segments.at(-1) ?? folderPath
}

function sessionResourceSkillTreeDepthCreate(folderPath: string, rootPaths: readonly string[]): number {
  const root = rootPaths.find((candidate) => sessionResourceSkillTreeFolderMatches(candidate, folderPath))
  const relative = root === undefined ? folderPath : folderPath.slice(root.length)
  return relative.split("/").filter((segment) => segment.length > 0).length
}

/**
 * Folder-group view of the discovered skill catalog. Every directory below a skill
 * root is a group, and a group carries every descendant skill so a parent toggle
 * recurses exactly like preset folder inclusion does on the server.
 */
export function sessionResourceSkillTreeDerive(
  input: SessionResourceSkillTreeDeriveInput,
): readonly SessionResourceSkillTreeFolderNode[] {
  const active = new Set(input.activeSkillNames)
  const excluded = new Set(input.excludedSkillNames)
  const groupPaths = [...new Set(input.groups.map(({ path }) => path))].sort(sessionResourceSkillTreePathSort)
  const rootPaths = groupPaths.filter(
    (candidate) =>
      !groupPaths.some((other) => other !== candidate && sessionResourceSkillTreeFolderMatches(other, candidate)),
  )
  const sourceByPath = new Map(input.groups.map(({ path, source }) => [path, source]))

  return groupPaths.map((folderPath) => {
    const descendants = input.skills
      .filter(({ bundlePath }) => sessionResourceSkillTreeFolderMatches(folderPath, bundlePath))
      .sort((left, right) => sessionResourceSkillTreePathSort(left.name, right.name))
    const direct = descendants.filter(({ bundlePath }) => bundlePath === folderPath)
    const selectable = descendants.filter(({ name }) => !excluded.has(name))
    const activeCount = selectable.filter(({ name }) => active.has(name)).length

    return {
      depth: sessionResourceSkillTreeDepthCreate(folderPath, rootPaths),
      descendantSkillNames: selectable.map(({ name }) => name),
      label: sessionResourceSkillTreeLabelCreate(folderPath),
      path: folderPath,
      selection:
        selectable.length === 0 || activeCount === 0 ? "none" : activeCount === selectable.length ? "all" : "partial",
      skills: direct.map(({ bundlePath, description, name, source }) => ({
        bundlePath,
        description,
        isActive: active.has(name),
        isExcluded: excluded.has(name),
        name,
        source,
      })),
      source: sourceByPath.get(folderPath) ?? "project",
    }
  })
}

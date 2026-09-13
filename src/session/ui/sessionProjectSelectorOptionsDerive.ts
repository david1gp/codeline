import type { SelectSingleEntry } from "#ui/input/select/SelectSingleEntry.js"
import type { SessionResourceSelectorProject } from "./sessionResourceSelectorView.js"

function sessionProjectSelectorTextCompare(left: string, right: string): number {
  return left.localeCompare(right, undefined, { sensitivity: "base" }) || left.localeCompare(right)
}

function sessionProjectSelectorPathHasHiddenSegment(path: string): boolean {
  return path.split(/[\\/]/).some((segment) => segment.startsWith("."))
}

/** Groups session projects by parent folder for SelectSingle while preserving ID selection. */
export function sessionProjectSelectorOptionsDerive(
  projects: readonly SessionResourceSelectorProject[],
  search = "",
): SelectSingleEntry[] {
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const visibleProjects = projects.filter((project) => {
    if (project.available === false) return false
    if (sessionProjectSelectorPathHasHiddenSegment(project.label)) return false
    if (sessionProjectSelectorPathHasHiddenSegment(project.parentFolder?.label ?? "")) return false
    if (normalizedSearch.length === 0) return true
    const visibleDetails = [project.label, project.parentFolder?.label ?? ""]
    return visibleDetails.some((detail) => detail.toLocaleLowerCase().includes(normalizedSearch))
  })
  const groups = new Map<string, { label: string; projects: SessionResourceSelectorProject[] }>()

  for (const project of visibleProjects) {
    const parentFolder = project.parentFolder
    const rawLabel = parentFolder?.label.trim() ?? ""
    const label = rawLabel || "Uncategorized"
    const groupId = rawLabel === "" ? "" : (parentFolder?.id ?? "")
    const group = groups.get(groupId)
    if (group === undefined) {
      groups.set(groupId, { label, projects: [project] })
      continue
    }
    group.projects.push(project)
  }

  return [...groups.values()]
    .sort((left, right) => sessionProjectSelectorTextCompare(left.label, right.label))
    .flatMap((group) => [
      { label: group.label, type: "group" as const },
      ...group.projects
        .sort(
          (left, right) =>
            sessionProjectSelectorTextCompare(left.label, right.label) || left.id.localeCompare(right.id),
        )
        .map((project) => ({ type: "item" as const, value: project.id })),
    ])
}

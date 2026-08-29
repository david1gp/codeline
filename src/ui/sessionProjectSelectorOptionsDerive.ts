import type { SelectSingleEntry } from "#ui/input/select/SelectSingleEntry.js"
import type { SessionResourceSelectorProject } from "./sessionResourceSelectorView.js"

function sessionProjectSelectorTextCompare(left: string, right: string): number {
  return left.localeCompare(right, undefined, { sensitivity: "base" }) || left.localeCompare(right)
}

/** Groups session projects by parent folder for SelectSingle while preserving ID selection. */
export function sessionProjectSelectorOptionsDerive(
  projects: readonly SessionResourceSelectorProject[],
): SelectSingleEntry[] {
  const groups = new Map<string, { label: string; projects: SessionResourceSelectorProject[] }>()

  for (const project of projects) {
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

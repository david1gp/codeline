import type { SelectSingleEntry } from "#ui/input/select/SelectSingleEntry.js"
import type { FilesScreenProject } from "./filesScreenView.js"

function filesProjectSelectorTextCompare(left: string, right: string): number {
  return left.localeCompare(right, undefined, { sensitivity: "base" }) || left.localeCompare(right)
}

/** Groups project IDs by parent folder for the Files selector without changing selection values. */
export function filesProjectSelectorOptionsDerive(projects: readonly FilesScreenProject[]): SelectSingleEntry[] {
  const groups = new Map<string, { label: string; projects: FilesScreenProject[] }>()

  for (const project of projects) {
    const parentFolder = project.parentFolder
    const groupId = parentFolder?.id ?? ""
    const label = parentFolder?.label.trim() || "Uncategorized"
    const group = groups.get(groupId)
    if (group === undefined) {
      groups.set(groupId, { label, projects: [project] })
      continue
    }
    group.projects.push(project)
  }

  return [...groups.values()]
    .sort((left, right) => filesProjectSelectorTextCompare(left.label, right.label))
    .flatMap((group) => [
      { label: group.label, type: "group" as const },
      ...group.projects
        .sort(
          (left, right) => filesProjectSelectorTextCompare(left.label, right.label) || left.id.localeCompare(right.id),
        )
        .map((project) => ({ type: "item" as const, value: project.id })),
    ])
}

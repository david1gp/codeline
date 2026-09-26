import type { SelectSingleEntry } from "#ui/input/select/SelectSingleEntry.js"
import type { SessionResourceSelectorProject } from "./sessionResourceSelectorView.js"

/** Rebuilds the flat select entries as accessible folder groups with project metadata for rendering. */
export function sessionProjectSelectorGroupsDerive(
  entries: readonly SelectSingleEntry[],
  projects: readonly SessionResourceSelectorProject[],
) {
  const projectsById = new Map(projects.map((project) => [project.id, project]))
  const groups: { label: string; projects: SessionResourceSelectorProject[] }[] = []

  for (const entry of entries) {
    if (entry.type === "group") {
      groups.push({ label: entry.label, projects: [] })
      continue
    }

    const project = projectsById.get(entry.value)
    const group = groups.at(-1)
    if (project === undefined || group === undefined) continue
    group.projects.push(project)
  }

  return groups
}

import type { SearchablePickerItem } from "./searchablePickerItem.js"
import type { FilesScreenProject } from "./filesScreenView.js"

/** Adapts the ordered Files project rows to the shared searchable picker contract. */
export function filesProjectPickerItemsDerive(
  projects: readonly FilesScreenProject[],
): readonly (SearchablePickerItem & { project: FilesScreenProject })[] {
  return projects.map((project) => ({
    description: project.parentFolder?.label.trim() || "Uncategorized",
    id: project.id,
    keywords: project.parentFolder?.label ? [project.parentFolder.label] : undefined,
    label: project.label,
    project,
  }))
}

import type { SearchablePickerItem } from "../../ui/searchablePickerItem.js"
import type { SessionResourceSelectorProject } from "./sessionResourceSelectorView.js"

function sessionProjectPickerTextCompare(left: string, right: string): number {
  return left.localeCompare(right, undefined, { sensitivity: "base" }) || left.localeCompare(right)
}

function sessionProjectPickerPathHasHiddenSegment(path: string): boolean {
  return path.split(/[\\/]/).some((segment) => segment.startsWith("."))
}

/** Adapts visible session projects to the shared picker while retaining disabled entries. */
export function sessionProjectPickerItemsDerive(
  projects: readonly SessionResourceSelectorProject[],
): readonly (SearchablePickerItem & { faviconUrl?: string | null })[] {
  return projects
    .filter(
      (project) =>
        !sessionProjectPickerPathHasHiddenSegment(project.label) &&
        !sessionProjectPickerPathHasHiddenSegment(project.parentFolder?.label ?? ""),
    )
    .sort(
      (left, right) =>
        sessionProjectPickerTextCompare(
          left.parentFolder?.label ?? "Uncategorized",
          right.parentFolder?.label ?? "Uncategorized",
        ) ||
        sessionProjectPickerTextCompare(left.label, right.label) ||
        left.id.localeCompare(right.id),
    )
    .map((project) => ({
      description: project.parentFolder?.label.trim() || "Uncategorized",
      disabled: project.available === false,
      disabledReason: project.available === false ? "Unavailable" : undefined,
      faviconUrl: project.faviconUrl,
      id: project.id,
      keywords: project.parentFolder?.label ? [project.parentFolder.label] : undefined,
      label: project.label,
    }))
}

function noteProjectPathNormalize(projectPath: string | null | undefined): string | null {
  return projectPath ?? null
}

function noteSortOrderRead(sortOrder: number | null | undefined): number | undefined {
  return typeof sortOrder === "number" && Number.isInteger(sortOrder) && sortOrder >= 0 ? sortOrder : undefined
}

function noteRowsCompare(left: any, right: any): number {
  const leftSortOrder = noteSortOrderRead(left.sortOrder)
  const rightSortOrder = noteSortOrderRead(right.sortOrder)
  if (leftSortOrder !== undefined && rightSortOrder !== undefined && leftSortOrder !== rightSortOrder)
    return leftSortOrder - rightSortOrder
  if (leftSortOrder !== undefined && rightSortOrder === undefined) return -1
  if (leftSortOrder === undefined && rightSortOrder !== undefined) return 1
  if (left.updatedAt !== right.updatedAt) return right.updatedAt - left.updatedAt
  if (left.id === right.id) return 0
  return left.id > right.id ? -1 : 1
}

export function noteRowsOrder(notes: readonly any[], projectPath?: string | null): any[] {
  const normalizedProjectPath = projectPath === undefined ? undefined : noteProjectPathNormalize(projectPath)
  return [...notes]
    .filter(
      (note) =>
        normalizedProjectPath === undefined || noteProjectPathNormalize(note.projectPath) === normalizedProjectPath,
    )
    .sort(noteRowsCompare)
}

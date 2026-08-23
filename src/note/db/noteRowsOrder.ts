import type { noteTable } from "./noteTable.js"
import { noteProjectPathNormalize } from "./noteProjectPathNormalize.js"
import { noteSortOrderRead } from "./noteSortOrderRead.js"

type NoteRow = typeof noteTable.$inferSelect

function noteRowsCompare(left: NoteRow, right: NoteRow): number {
  const leftSortOrder = noteSortOrderRead(left.sortOrder)
  const rightSortOrder = noteSortOrderRead(right.sortOrder)
  if (leftSortOrder !== undefined && rightSortOrder !== undefined && leftSortOrder !== rightSortOrder)
    return leftSortOrder - rightSortOrder
  if (leftSortOrder !== undefined && rightSortOrder === undefined) return -1
  if (leftSortOrder === undefined && rightSortOrder !== undefined) return 1
  const updatedAtDifference = right.updatedAt.getTime() - left.updatedAt.getTime()
  if (updatedAtDifference !== 0) return updatedAtDifference
  if (left.id === right.id) return 0
  return left.id > right.id ? -1 : 1
}

export function noteRowsOrder(notes: readonly NoteRow[], projectPath?: string | null): NoteRow[] {
  const normalizedProjectPath = projectPath === undefined ? undefined : noteProjectPathNormalize(projectPath)
  return [...notes]
    .filter(
      (note) =>
        normalizedProjectPath === undefined || noteProjectPathNormalize(note.projectPath) === normalizedProjectPath,
    )
    .sort(noteRowsCompare)
}

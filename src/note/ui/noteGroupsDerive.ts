import type { ProjectApiListResponse } from "../../project/api/projectApiListResponseSchema.js"
import { noteProjectLabelResolve } from "./noteProjectLabelResolve.js"

export type NoteGroupRow = {
  id: string
  content?: string
  projectPath?: string | null
  sortOrder?: number | null
  updatedAt: number
}

function noteSortOrderRead(sortOrder: number | null | undefined): number | undefined {
  return typeof sortOrder === "number" && Number.isInteger(sortOrder) && sortOrder >= 0 ? sortOrder : undefined
}

function noteRowsCompare(left: NoteGroupRow, right: NoteGroupRow): number {
  const leftSortOrder = noteSortOrderRead(left.sortOrder)
  const rightSortOrder = noteSortOrderRead(right.sortOrder)
  if (leftSortOrder !== undefined && rightSortOrder !== undefined && leftSortOrder !== rightSortOrder) {
    return leftSortOrder - rightSortOrder
  }
  if (leftSortOrder !== undefined && rightSortOrder === undefined) return -1
  if (leftSortOrder === undefined && rightSortOrder !== undefined) return 1
  if (left.updatedAt !== right.updatedAt) return right.updatedAt - left.updatedAt
  if (left.id === right.id) return 0
  return left.id > right.id ? -1 : 1
}

function noteGroupsCompare(left: { projectPath: string | null }, right: { projectPath: string | null }): number {
  if (left.projectPath === right.projectPath) return 0
  if (left.projectPath === null) return 1
  if (right.projectPath === null) return -1
  return left.projectPath < right.projectPath ? -1 : 1
}

export function noteGroupsDerive<Note extends NoteGroupRow>(
  notes: readonly Note[],
  projects: ProjectApiListResponse["projects"] = [],
) {
  const groups = new Map<string | null, Note[]>()
  for (const note of [...notes].sort(noteRowsCompare)) {
    const projectPath = note.projectPath ?? null
    const group = groups.get(projectPath) ?? []
    group.push(note)
    groups.set(projectPath, group)
  }
  return [...groups]
    .map(([projectPath, groupedNotes]) => ({
      label: noteProjectLabelResolve(projects, projectPath),
      projectPath,
      notes: groupedNotes,
    }))
    .sort(noteGroupsCompare)
}

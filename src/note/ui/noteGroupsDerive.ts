import type { ProjectRegistryApiProject } from "../../project/api/projectRegistryApiProjectSchema.js"
import { noteProjectLabelResolve } from "./noteProjectLabelResolve.js"

export type NoteGroupRow = {
  id: string
  content?: string
  projectId: string | null
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

function noteGroupsCompare(left: { projectId: string | null }, right: { projectId: string | null }): number {
  if (left.projectId === right.projectId) return 0
  if (left.projectId === null) return 1
  if (right.projectId === null) return -1
  return left.projectId < right.projectId ? -1 : 1
}

export function noteGroupsDerive<Note extends NoteGroupRow>(
  notes: readonly Note[],
  projects: readonly ProjectRegistryApiProject[] = [],
) {
  const groups = new Map<string | null, Note[]>()
  for (const note of [...notes].sort(noteRowsCompare)) {
    const projectId = note.projectId
    const group = groups.get(projectId) ?? []
    group.push(note)
    groups.set(projectId, group)
  }
  return [...groups]
    .map(([projectId, groupedNotes]) => ({
      label: noteProjectLabelResolve(projects, projectId, groupedNotes[0]?.projectPath),
      projectId,
      projectPath: groupedNotes[0]?.projectPath ?? null,
      notes: groupedNotes,
    }))
    .sort(noteGroupsCompare)
}
